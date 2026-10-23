"""Provider completion is required; truncated content is never a successful reply."""
import os
import types
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DEEPSEEK_API_KEY", "test-placeholder-not-a-real-key")
from app.services.chat import chat_stream, chat_sync, adeepseek
from app.api.chat import stream_chat, ChatRequest


class Response:
    def __init__(self, finish):
        self.finish = finish
        self.closed = False

    async def __aiter__(self):
        yield types.SimpleNamespace(choices=[])
        yield types.SimpleNamespace(choices=[types.SimpleNamespace(
            finish_reason=None, delta=types.SimpleNamespace(content="部分回答"))])
        if self.finish:
            yield types.SimpleNamespace(choices=[types.SimpleNamespace(
                finish_reason=self.finish, delta=types.SimpleNamespace(content=None))])

    async def close(self):
        self.closed = True


class ChatCompletionTest(unittest.IsolatedAsyncioTestCase):
    async def test_stream_requires_stop_and_always_closes_provider(self):
        for finish in ("stop", "length", "content_filter", None):
            with self.subTest(finish=finish):
                response = Response(finish)
                with patch.object(adeepseek.chat.completions, "create", new_callable=AsyncMock, return_value=response):
                    if finish == "stop":
                        self.assertEqual(["部分回答"], [s async for s in chat_stream([])])
                    else:
                        with self.assertRaises(ValueError):
                            _ = [s async for s in chat_stream([])]
                self.assertTrue(response.closed)

    async def test_api_marks_incomplete_generation_as_error_not_done(self):
        with patch.object(adeepseek.chat.completions, "create", new_callable=AsyncMock, return_value=Response("length")):
            response = await stream_chat(ChatRequest(messages=[{"role": "user", "content": "问题"}]))
            wire = "".join([s async for s in response.body_iterator])
            self.assertIn("[ERROR]", wire)
            self.assertNotIn("[DONE]", wire)

    async def test_sync_rejects_truncated_empty_or_missing_responses(self):
        for finish, content in (("length", "partial"), ("stop", " "), ("stop", "answer")):
            with self.subTest(finish=finish, content=content):
                response = types.SimpleNamespace(choices=[types.SimpleNamespace(
                    finish_reason=finish, message=types.SimpleNamespace(content=content))])
                with patch.object(adeepseek.chat.completions, "create", new_callable=AsyncMock, return_value=response):
                    if content == "answer":
                        self.assertEqual("answer", await chat_sync([]))
                    else:
                        with self.assertRaises(ValueError):
                            await chat_sync([])
