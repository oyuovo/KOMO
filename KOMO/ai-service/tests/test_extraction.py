import sys
import json
import types
import unittest
from unittest.mock import Mock


create_completion = Mock(side_effect=RuntimeError("provider unavailable"))
clients_stub = types.ModuleType("app.core.clients")
clients_stub.deepseek = types.SimpleNamespace(
    chat=types.SimpleNamespace(
        completions=types.SimpleNamespace(create=create_completion)
    )
)
sys.modules["app.core.clients"] = clients_stub

from app.services.extraction import extract_knowledge  # noqa: E402


class ExtractionFailureTest(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        create_completion.reset_mock()
        create_completion.side_effect = RuntimeError("provider unavailable")

    def completion(self, payload, finish_reason="stop"):
        create_completion.side_effect = None
        create_completion.return_value = types.SimpleNamespace(choices=[types.SimpleNamespace(
            finish_reason=finish_reason,
            message=types.SimpleNamespace(content=json.dumps(payload, ensure_ascii=False)),
        )])

    async def test_json_object_envelope_retains_knowledge_points(self):
        point = {"type": "FRAGMENT", "title": "工具调用", "content": "模型选择工具，服务端执行并回传结果。", "confidence": 0.9}
        self.completion({"knowledge_points": [point]})
        self.assertEqual([point], await extract_knowledge([]))

    async def test_legacy_array_still_supported(self):
        point = {"type": "FRAGMENT", "title": "HTTP", "content": "请求与响应。", "confidence": 0.8}
        self.completion([point])
        self.assertEqual([point], await extract_knowledge([]))

    async def test_explicit_empty_results_are_successful(self):
        for payload in ([], {"knowledge_points": []}):
            self.completion(payload)
            self.assertEqual([], await extract_knowledge([]))

    async def test_invalid_shape_is_not_reported_as_no_knowledge(self):
        for payload in ({}, {"other": []}, {"knowledge_points": {}}, ["not a point"], [{"title": "missing fields"}]):
            self.completion(payload)
            with self.assertRaises(ValueError):
                await extract_knowledge([])

    async def test_invalid_json_is_not_reported_as_no_knowledge(self):
        self.completion([])
        create_completion.return_value.choices[0].message.content = '{"knowledge_points": ['
        with self.assertRaises(ValueError):
            await extract_knowledge([])

    async def test_truncated_output_is_not_reported_as_success(self):
        self.completion({"knowledge_points": []}, finish_reason="length")
        with self.assertRaises(ValueError):
            await extract_knowledge([])

    async def test_confidence_filter_and_article_downgrade_are_preserved(self):
        self.completion({"knowledge_points": [
            {"type": "ARTICLE", "title": "短文", "content": "少量正文", "confidence": 0.9},
            {"type": "FRAGMENT", "title": "低置信度", "content": "正文", "confidence": 0.2},
        ]})
        result = await extract_knowledge([])
        self.assertEqual(1, len(result))
        self.assertEqual("FRAGMENT", result[0]["type"])

    async def test_provider_failure_propagates_to_http_and_queue_retry(self):
        with self.assertRaises(RuntimeError):
            await extract_knowledge([
                {"role": "user", "content": "question"},
                {"role": "assistant", "content": "answer"},
            ])


if __name__ == "__main__":
    unittest.main()
