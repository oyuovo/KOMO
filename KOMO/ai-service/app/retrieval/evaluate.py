"""Real embedding comparison; synthetic fixtures, not answer-quality claims.

python -m app.retrieval.evaluate --output report.json
--url uses a temporary collection on the specified Qdrant server.
"""
import argparse
import json
import logging
from pathlib import Path
from time import monotonic
from uuid import uuid4

from qdrant_client import QdrantClient

from app.reading.core import Document
from .embedding import LocalEmbedding
from .engine import HybridRetrieval, revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases', type=Path, default=Path('evals/retrieval/cases.json'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--url')
    args = parser.parse_args()
    fixtures = json.loads(args.cases.read_text(encoding='utf-8'))
    client = QdrantClient(url=args.url, timeout=30) if args.url else QdrantClient(':memory:')
    collection = 'komo_evaluation_' + uuid4().hex
    model = LocalEmbedding()
    engine = HybridRetrieval(client, model, collection)
    started = monotonic()
    try:
        default_owner = 'alice' if any('owner' in d for d in fixtures['documents']) else 'evaluation-only'
        docs = [Document(**{k: d[k] for k in ('id', 'title', 'content')}) for d in fixtures['documents']]
        for doc, raw in zip(docs, fixtures['documents']):
            engine.index(raw.get('owner', default_owner), doc)
        rows = []
        for case in fixtures['queries']:
            owner = case.get('owner', default_owner)
            manifest = [{'id': d.id, 'revision': revision(d)} for d, raw in zip(docs, fixtures['documents'])
                        if raw.get('owner', default_owner) == owner
                        and (not case.get('knowledgeBase') or raw.get('knowledgeBase') == case['knowledgeBase'])]
            expected = case.get('expectedIds', [case.get('document_id')])
            strategies = {}
            for strategy in ('lexical', 'dense', 'hybrid'):
                start = monotonic()
                hits = engine.search(owner, manifest, case['query'], 3, strategy)
                strategies[strategy] = {
                    'elapsed_ms': round((monotonic() - start) * 1000), 'hits': hits,
                    'evidence_at_3': (any(h['document_id'] in expected and case['evidence'] in h['text']
                                         for h in hits) if case.get('evidence') else None)}
            rows.append({**case, 'strategies': strategies})
        report = {'model': model.name, 'backend': 'server' if args.url else 'qdrant-local',
                  'elapsed_seconds': round(monotonic() - started, 2), 'results': rows,
                  'limitations': 'Synthetic diagnostic fixtures. No generation or entailment evaluation. No-answer queries still retrieve candidates.'}
        report['evidence_at_3'] = {s: sum(r['strategies'][s]['evidence_at_3'] is True for r in rows)
                                   for s in ('lexical', 'dense', 'hybrid')}
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({k: v for k, v in report.items() if k != 'results'}, ensure_ascii=False))
    finally:
        try:
            if client.collection_exists(collection):
                client.delete_collection(collection)
        except Exception:
            logging.exception('Could not clean temporary evaluation collection %s', collection)
        finally:
            client.close()


if __name__ == '__main__':
    main()
