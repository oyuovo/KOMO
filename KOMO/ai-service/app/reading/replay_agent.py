"""Replay recorded real decisions offline. No provider import or new API requests."""
import argparse
import asyncio
import copy
import json
from pathlib import Path

from .agent import acquire_evidence
from .core import Document, PreparedReading
from .render_agent_evaluation import evidence_metrics
from app.retrieval.evaluate_learning import digest


async def replay(root):
    manifest_path = root / 'agent-rounds-manifest.json'
    result_path = root / 'agent-rounds-results.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    recorded = json.loads(result_path.read_text(encoding='utf-8'))
    if digest(manifest_path) != recorded['manifest_sha256']:
        raise ValueError('Recorded manifest mismatch')
    cases = {c['id']: c for c in manifest['cases']}
    rows = []
    for old in recorded['results']:
        case = cases[old['id']]
        decisions = iter([r['response']['choices'][0]['message'].get('tool_calls') or []
            for r in recorded['requests'] if r['variant'] == old['variant'] and not r['parameters'].get('stream')])
        searches = iter([s for s in old['context']['agent']['steps'] if s['tool'] == 'search_document'])
        async def planner(messages, tools):
            return {'tool_calls': next(decisions)}
        async def searcher(document, query, user_id):
            search = next(searches)
            if query != search['arguments']['query']:
                raise ValueError('Replay query differs from recorded trace')
            return [{'chunk_index': i} for i in search['chunk_indices']]
        prepared = PreparedReading(copy.deepcopy(case['initial_messages']), copy.deepcopy(case['initial_context']))
        final = await acquire_evidence(Document(**case['document']), case['question'], [], '', 'offline-replay',
                                       prepared, planner, searcher, max_rounds=old['max_rounds'])
        rows.append({'variant': old['variant'], 'id': old['id'],
            'old_gold': evidence_metrics(case, old['context']), 'new_gold': evidence_metrics(case, final.context),
            'context': final.context})
    return {'mode': 'recorded_decision_replay_no_generation', 'recorded_results_sha256': digest(result_path),
            'code_sha256': {name: digest(Path(__file__).with_name(name)) for name in ('core.py', 'agent.py', 'replay_agent.py')},
            'limitations': 'Tool decisions are replayed, not regenerated. No claim about new answers or autonomous decisions.',
            'results': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('evals/agent-learning/results'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Output exists')
    result = asyncio.run(replay(args.root))
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print('Replayed ' + str(len(result['results'])) + ' variants without model calls.')


if __name__ == '__main__':
    main()
