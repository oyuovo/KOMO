import sys
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

    async def test_provider_failure_propagates_to_http_and_queue_retry(self):
        with self.assertRaises(RuntimeError):
            await extract_knowledge([
                {"role": "user", "content": "question"},
                {"role": "assistant", "content": "answer"},
            ])


if __name__ == "__main__":
    unittest.main()
