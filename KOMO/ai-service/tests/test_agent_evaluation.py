import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock

from app.reading.evaluate_agent import RecordingClient, RecordedStream, validate_manifest


class AgentEvaluationTest(unittest.IsolatedAsyncioTestCase):
    async def test_request_budget_and_retry_override(self):
        response = SimpleNamespace(model_dump=lambda: {'choices': []}, usage=None)
        create = AsyncMock(return_value=response)
        child = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        client = Mock()
        client.with_options.return_value = child
        report, save = {'requests': []}, Mock()
        recorder = RecordingClient(client, report, save)
        recorder.variant = 'q-r1'
        await recorder.with_options(max_retries=1, timeout=60).chat.completions.create(stream=False)
        self.assertEqual(client.with_options.call_args.kwargs['max_retries'], 0)
        self.assertEqual(report['requests'][0]['state'], 'completed')
        self.assertEqual(report['requests'][0]['variant'], 'q-r1')
        report['requests'] = [{}] * 30
        with self.assertRaisesRegex(ValueError, 'budget exhausted'):
            await recorder.with_options().chat.completions.create(stream=False)
        self.assertEqual(create.await_count, 1)

    async def test_stream_usage_and_finish_are_preserved(self):
        class Stream:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                return False
            def __aiter__(self):
                async def chunks():
                    yield SimpleNamespace(usage=None, model='test', choices=[SimpleNamespace(
                        finish_reason='stop', delta=SimpleNamespace(content='answer'))])
                    yield SimpleNamespace(usage=SimpleNamespace(model_dump=lambda: {'total_tokens': 12}),
                                          model='test', choices=[])
                return chunks()
        record = {'text': ''}
        async with RecordedStream(Stream(), record, Mock()) as stream:
            async for _ in stream:
                pass
        self.assertEqual(record['state'], 'completed')
        self.assertEqual(record['usage']['total_tokens'], 12)
        self.assertEqual(record['text'], 'answer')

    def test_manifest_hash_checked_before_any_provider_import(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'manifest.json'
            path.write_text(json.dumps({'changed': True}), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                validate_manifest(path, 'old-hash')
