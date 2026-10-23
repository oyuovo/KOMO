"""Run with: python -m app.reading.evaluate evals/reading/cases.jsonl

Default: no credentials, network, database, or model. --generate explicitly calls
the configured provider; output is for human review, never a truth score.
"""
import argparse
import asyncio
import json
from pathlib import Path

from .core import Document, POLICY_VERSION, prepare_reading


def evaluate(cases):
    results = []
    for case in cases:
        document = Document(**case['document'])
        prepared = prepare_reading(document, case['question'], case.get('history'), case.get('selection', ''))
        evidence = '\n'.join(s['text'] for s in prepared.context['sources'])
        required = case.get('required_evidence', [])
        row = {'id': case['id'], 'category': case.get('category'),
               'expected_behavior': case.get('expected_behavior'),
               'required_evidence_count': len(required),
               'evidence_hits': sum(quote in evidence for quote in required),
               'old_prefix_hits': sum(quote in document.content[:12000] for quote in required),
               'context': prepared.context}
        results.append(row)
    return {'policy_version': POLICY_VERSION, 'mode': 'evidence_only',
            'limitations': 'Fixture evidence coverage is not answer correctness, entailment, or real-user accuracy.',
            'case_count': len(results), 'results': results}


async def generate_answers(report, cases):
    from app.api.reading import runtime
    from app.core.config import DEEPSEEK_MODEL
    report['mode'] = 'generation_review'
    report['model'] = DEEPSEEK_MODEL
    for case, row in zip(cases, report['results']):
        answer = ''
        async for event in runtime.stream(Document(**case['document']), case['question'],
                                          case.get('history'), case.get('selection', ''), 'reading-evaluation'):
            if event['type'] == 'token':
                answer += event['data']
            else:
                row['context'] = event['data']
        row['answer_for_human_review'] = answer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cases', type=Path)
    parser.add_argument('--generate', action='store_true', help='Call the real model; incurs provider usage')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    cases = [json.loads(line) for line in args.cases.read_text(encoding='utf-8').splitlines() if line.strip()]
    report = evaluate(cases)
    if args.generate:
        asyncio.run(generate_answers(report, cases))
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + '\n', encoding='utf-8')
    else:
        print(text)


if __name__ == '__main__':
    main()
