"""Replay frozen retrieval rankings to isolate context assembly; no model/network calls.

This is a development regression, NOT an autonomous-agent or answer-quality score.
Run: python -m app.reading.replay_context --output <new-report.json>
"""
import argparse
import hashlib
import json
from pathlib import Path

from .core import CONTEXT_CHARS, prepare_reading
from app.retrieval.evaluate_learning import load_suite, reading_document, covered, digest


def replay(root):
    _, suite, documents = load_suite(root)
    baseline_path = root / 'results/baseline.json'
    baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
    if baseline['cases_sha256'] != digest(root / 'cases.json'):
        raise ValueError('Frozen cases differ from baseline')
    previous = {r['id']: r for r in baseline['results']}
    rows = []
    for case in suite['cases']:
        doc, offsets = reading_document(case, documents)
        old = previous[case['id']]['reading']
        if old['context']['document_hash'] != hashlib.sha256(doc.content.encode()).hexdigest():
            raise ValueError('Frozen document differs from baseline')
        candidates = old['context'].get('retrieval', {}).get('candidates')
        if len(doc.content) > CONTEXT_CHARS and candidates is None:
            raise ValueError('Missing frozen long-document rankings')
        prepared = prepare_reading(doc, case['question'],
            ranked_indices=[h['chunk_index'] for h in candidates] if candidates is not None else None)
        evidence = [{**e, 'document_id': doc.id, 'start_offset': e['start_offset'] + offsets[e['document_id']],
                     'end_offset': e['end_offset'] + offsets[e['document_id']]} for e in case['evidence']]
        hits = [{**s, 'document_id': doc.id} for s in prepared.context['sources']]
        found = sum(covered(e, hits) for e in evidence) if evidence else None
        rows.append({'id': case['id'], 'required_evidence': len(evidence), 'old_hits': old['evidence_hits'],
                     'new_hits': found, 'context': prepared.context})
    scored = [r for r in rows if r['required_evidence']]
    return {'mode': 'frozen_ranking_context_replay', 'baseline_sha256': digest(baseline_path),
        'core_sha256': digest(Path(__file__).with_name('core.py')),
        'limitations': 'Same development cases and frozen rankings. No real model decisions or generated answers. '
                       'User questions without gold labels are unscored; this is not end-to-end accuracy.',
        'summary': {'cases': len(rows), 'scored': len(scored),
            'old_complete': sum(r['old_hits'] == r['required_evidence'] for r in scored),
            'new_complete': sum(r['new_hits'] == r['required_evidence'] for r in scored),
            'regressed': [r['id'] for r in scored if r['new_hits'] < r['old_hits']],
            'improved': [r['id'] for r in scored if r['new_hits'] > r['old_hits']]},
        'results': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', type=Path, default=Path('evals/agent-learning'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = replay(args.suite)
    # Never overwrite the baseline or an earlier result.
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps(report['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
