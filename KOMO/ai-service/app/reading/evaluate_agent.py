"""Bounded real-agent ablation on frozen public documents. No network in --prepare.

Execution requires the exact manifest SHA256; never reads credentials from files.
Every outbound request and returned decision is saved, excluding credentials.
"""
import argparse
import asyncio
import copy
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from time import monotonic
from types import SimpleNamespace
from unittest.mock import patch

from .core import Document, PreparedReading, prepare_reading
from .runtime import ReadingRuntime
from app.retrieval.evaluate_learning import load_suite, reading_document, digest, write_report

CASE_IDS = ['u01', 'u02', 'a02', 'a15', 'n01']
CODE_FILES = ['app/reading/core.py', 'app/reading/agent.py', 'app/reading/runtime.py',
              'app/api/reading.py', 'app/retrieval/reading.py', 'app/retrieval/engine.py',
              'app/retrieval/embedding.py', 'app/retrieval/lexical.py', 'app/reading/evaluate_agent.py']


def prepare(root):
    _, suite, documents = load_suite(root)
    baseline_path = root / 'results/baseline.json'
    baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
    cases = {c['id']: c for c in suite['cases']}
    old = {c['id']: c for c in baseline['results']}
    rows = []
    for ident in CASE_IDS:
        case = cases[ident]
        doc, offsets = reading_document(case, documents)
        old_context = old[ident]['reading']['context']
        if hashlib.sha256(doc.content.encode()).hexdigest() != old_context['document_hash']:
            raise ValueError('Document differs from frozen baseline')
        candidates = old_context.get('retrieval', {}).get('candidates')
        prepared = prepare_reading(doc, case['question'],
            ranked_indices=[h['chunk_index'] for h in candidates] if candidates is not None else None)
        rows.append({'id': ident, 'question': case['question'], 'reading_ids': case['reading_ids'],
            'expected_behavior': case['expected_behavior'], 'evidence': case['evidence'], 'source_offsets': offsets,
            'document': asdict(doc), 'initial_messages': prepared.messages, 'initial_context': prepared.context})
    return {'protocol': 'reading-agent-round-ablation-v1', 'case_ids': CASE_IDS, 'round_limits': [0, 1, 2],
        'max_requests': 30, 'planner_output_tokens': 768, 'answer_output_tokens': 2048,
        'temperature': .2, 'sdk_retries': 0, 'endpoint': 'https://api.deepseek.com/v1/chat/completions',
        'baseline_sha256': digest(baseline_path), 'source_manifest_sha256': digest(root / 'sources.json'),
        'code_sha256': {p: digest(Path(p)) for p in CODE_FILES},
        'scope': 'Only these five questions, their pinned public document snapshots, instructions, and tool results '
                 'from those same snapshots may be sent. No account documents or conversation history.',
        'limitations': 'Development regression, one run per cell, not a blind test or significance claim. '
                       'Initial rankings frozen to isolate context/tool changes. Live hybrid searches use local embeddings. '
                       'SDK retries disabled for all variants; production answer adapter normally permits one retry.',
        'cases': rows}


def validate_manifest(path, expected):
    if digest(path) != expected:
        raise ValueError('Manifest hash mismatch')
    manifest = json.loads(path.read_text(encoding='utf-8'))
    if manifest.get('case_ids') != CASE_IDS or manifest.get('round_limits') != [0, 1, 2] or manifest.get('max_requests') != 30:
        raise ValueError('Unexpected experiment budget')
    if [c['id'] for c in manifest['cases']] != CASE_IDS:
        raise ValueError('Unexpected experiment cases')
    if manifest['code_sha256'] != {p: digest(Path(p)) for p in CODE_FILES}:
        raise ValueError('Code changed after manifest freeze')
    for case in manifest['cases']:
        if hashlib.sha256(case['document']['content'].encode()).hexdigest() != case['initial_context']['document_hash']:
            raise ValueError('Document snapshot mismatch')
    return manifest


class RecordedStream:
    def __init__(self, stream, record, save):
        self.stream, self.record, self.save = stream, record, save

    async def __aenter__(self):
        await self.stream.__aenter__()
        return self

    async def __aexit__(self, *args):
        try:
            return await self.stream.__aexit__(*args)
        finally:
            self.record['state'] = 'completed' if self.record.get('finish_reason') == 'stop' and args[0] is None else 'incomplete'
            self.save()

    def __aiter__(self):
        async def chunks():
            async for chunk in self.stream:
                if chunk.usage is not None:
                    self.record['usage'] = chunk.usage.model_dump()
                if chunk.model:
                    self.record['returned_model'] = chunk.model
                for choice in chunk.choices:
                    if choice.finish_reason:
                        self.record['finish_reason'] = choice.finish_reason
                    if choice.delta.content:
                        self.record['text'] += choice.delta.content
                yield chunk
        return chunks()


class RecordingClient:
    """Proxy production provider calls; disable retries and collect stream usage."""
    def __init__(self, client, report, save):
        self.client, self.report, self.save = client, report, save
        self.variant = None

    def with_options(self, **options):
        options['max_retries'] = 0
        client = self.client.with_options(**options)
        async def create(**params):
            if len(self.report['requests']) >= 30:
                raise ValueError('Experiment request budget exhausted')
            if params.get('stream'):
                params['stream_options'] = {'include_usage': True}
            record = {'variant': self.variant, 'state': 'sending', 'parameters': copy.deepcopy(params),
                      'usage': None, 'text': ''}
            self.report['requests'].append(record)
            self.save()
            started = monotonic()
            try:
                response = await client.chat.completions.create(**params)
                record['response_ms'] = round((monotonic() - started) * 1000)
                if params.get('stream'):
                    return RecordedStream(response, record, self.save)
                record.update(state='completed', response=response.model_dump())
                if response.usage is not None:
                    record['usage'] = response.usage.model_dump()
                self.save()
                return response
            except BaseException as error:
                record.update(state='failed', error_type=type(error).__name__)
                self.save()
                raise
        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


async def run(args):
    manifest = validate_manifest(args.manifest, args.expected_sha256)
    if args.output.exists():
        raise ValueError('Output exists; preserve previous runs')
    from qdrant_client import QdrantClient
    from app.retrieval.embedding import LocalEmbedding
    from app.retrieval.engine import HybridRetrieval
    from app.retrieval.reading import search_document
    from app.api import reading as api
    from app.core.config import DEEPSEEK_MODEL

    report = {'protocol': manifest['protocol'], 'manifest_sha256': digest(args.manifest),
        'started_at': datetime.now(timezone.utc).isoformat(), 'state': 'running', 'model': DEEPSEEK_MODEL,
        'limits': {k: manifest[k] for k in ['max_requests', 'round_limits', 'sdk_retries']},
        'limitations': manifest['limitations'], 'requests': [], 'results': []}
    save = lambda: write_report(args.output, report)
    original_client = api.adeepseek
    recording = RecordingClient(original_client, report, save)
    local_store = QdrantClient(':memory:')
    engine = HybridRetrieval(local_store, LocalEmbedding())
    owner = 'agent-round-ablation-public-documents'
    try:
        # Prewarm all documents outside model time budgets; no writes to application collections.
        for case in manifest['cases']:
            await asyncio.to_thread(engine.index, owner, Document(**case['document']))
        with patch.object(api, 'adeepseek', recording), patch('app.retrieval.reading.get_retrieval', return_value=engine):
            for number, case in enumerate(manifest['cases']):
                # Rotate order, avoiding always running the largest budget last.
                budgets = [0, 1, 2]
                budgets = budgets[number % 3:] + budgets[:number % 3]
                for rounds in budgets:
                    variant = case['id'] + '-r' + str(rounds)
                    recording.variant = variant
                    row = {'id': case['id'], 'variant': variant, 'max_rounds': rounds, 'question': case['question'],
                           'state': 'running', 'human_grade': None}
                    report['results'].append(row)
                    async def frozen_preparer(*_args):
                        return PreparedReading(copy.deepcopy(case['initial_messages']), copy.deepcopy(case['initial_context']))
                    runtime = ReadingRuntime(api.model_stream, preparer=frozen_preparer, planner=api.model_plan,
                                             searcher=search_document, max_rounds=rounds)
                    answer, started = '', monotonic()
                    try:
                        async for event in runtime.stream(Document(**case['document']), case['question'], user_id=owner):
                            if event['type'] == 'token':
                                answer += event['data']
                            else:
                                row['context'] = event['data']
                        row.update(state='completed', answer=answer)
                    except Exception as error:
                        row.update(state='failed', error_type=type(error).__name__, partial_answer=answer)
                        if getattr(error, 'finish_reason', None):
                            row['finish_reason'] = error.finish_reason
                        if getattr(error, 'status_code', None) in {401, 402, 403}:
                            raise RuntimeError('Provider refused credentials/billing; stopping batch') from None
                    finally:
                        row['elapsed_ms'] = round((monotonic() - started) * 1000)
                        save()
                    print(variant + ' ' + row['state'], flush=True)
        report['state'] = 'completed' if all(r['state'] == 'completed' for r in report['results']) else 'partial_failure'
    except BaseException:
        report['state'] = 'failed'
        raise
    finally:
        local_store.close()
        await original_client.close()
        save()
    print(json.dumps({'state': report['state'], 'requests': len(report['requests'])}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--suite', type=Path, default=Path('evals/agent-learning'))
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--expected-sha256')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.prepare:
        manifest = prepare(args.suite)
        with args.manifest.open('x', encoding='utf-8') as output:
            json.dump(manifest, output, ensure_ascii=False, indent=2)
            output.write('\n')
        print(digest(args.manifest))
    elif not args.expected_sha256 or not args.output:
        parser.error('Execution needs --expected-sha256 and --output')
    else:
        asyncio.run(run(args))


if __name__ == '__main__':
    main()
