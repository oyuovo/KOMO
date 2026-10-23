"""模型请求替身控制等待顺序，不联网、不消耗模型额度。"""
import asyncio
import json
import os
import types
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DEEPSEEK_API_KEY", "test-placeholder-not-a-real-key")
from app.core.clients import adeepseek
from app.services.chat import chat_stream
from app.services.extraction import extract_knowledge
from app.services.dedup import check_semantic_duplicate
from app.services.recommendation import generate_daily_questions


class AsyncServicesTest(unittest.IsolatedAsyncioTestCase):
    async def assert_chat_continues(self, operation, payload):
        entered, release = asyncio.Event(), asyncio.Event()

        async def chunks():
            yield types.SimpleNamespace(choices=[types.SimpleNamespace(
                finish_reason=None, delta=types.SimpleNamespace(content="first token"))])

        async def provider(**kwargs):
            if kwargs.get("stream"):
                iterator = chunks()
                class Response:
                    def __aiter__(self): return iterator
                    async def close(self): await iterator.aclose()
                return Response()
            entered.set()
            await release.wait()
            return types.SimpleNamespace(choices=[types.SimpleNamespace(
                finish_reason="stop", message=types.SimpleNamespace(content=json.dumps(payload)))])

        with patch.object(adeepseek.chat.completions, "create", new_callable=AsyncMock, side_effect=provider) as completion:
            task = asyncio.create_task(operation())
            stream = chat_stream([{"role": "user", "content": "hello"}])
            try:
                await asyncio.wait_for(entered.wait(), 1)
                self.assertEqual("first token", await asyncio.wait_for(anext(stream), 1))
                self.assertFalse(task.done(), "background AI call should still be waiting")
            finally:
                release.set()
                await task
                await stream.aclose()
            self.assertEqual(2, completion.await_count)

    async def test_extraction_does_not_delay_chat(self):
        await self.assert_chat_continues(lambda: extract_knowledge([]), {"knowledge_points": []})

    async def test_dedup_does_not_delay_chat(self):
        await self.assert_chat_continues(
            lambda: check_semantic_duplicate("title", "text", [{"title": "old", "content": "old"}]),
            {"verdict": "NEW", "confidence": 0.8, "reason": "different", "matched_index": -1},
        )

    async def test_recommendation_does_not_delay_chat(self):
        await self.assert_chat_continues(
            lambda: generate_daily_questions("test-user", {"recent_entries": [{"title": "test"}] * 5}),
            {"questions": []},
        )
