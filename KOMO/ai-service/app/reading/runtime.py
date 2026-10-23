"""Bounded reading agent, injectable and testable without an API key."""
import asyncio
from contextlib import aclosing
import logging
from time import monotonic
from uuid import uuid4

from .core import Document, check_citations, prepare_reading
from .agent import acquire_evidence, PLANNING_SECONDS, RESERVE_ANSWER_SECONDS, MAX_ROUNDS

logger = logging.getLogger(__name__)


class ReadingRuntime:
    def __init__(self, provider, concurrency: int = 4, timeout: float = 90, queue_timeout: float = 2,
                 preparer=None, planner=None, searcher=None, max_rounds=MAX_ROUNDS):
        self.provider = provider
        self.preparer = preparer
        self.planner = planner
        self.searcher = searcher
        if type(max_rounds) is not int or not 0 <= max_rounds <= 3:
            raise ValueError("Reading rounds must be an integer between zero and three")
        self.max_rounds = max_rounds
        if planner is not None and searcher is None:
            raise ValueError("Agent requires a scoped search tool")
        self.slots = asyncio.Semaphore(concurrency)
        self.timeout = timeout
        self.queue_timeout = queue_timeout

    async def stream(self, document: Document, question: str, history=None, selection: str = "", user_id: str = ""):
        run_id = str(uuid4())
        started = monotonic()
        await asyncio.wait_for(self.slots.acquire(), self.queue_timeout)
        try:
            execution_started = monotonic()
            async with asyncio.timeout(self.timeout):
                prepared = (await self.preparer(document, question, history, selection, user_id)
                            if self.preparer else prepare_reading(document, question, history, selection))
                context = {**prepared.context, "run_id": run_id, "state": "running"}
                yield {"type": "context", "data": context}
                if self.planner is not None:
                    planning_seconds = max(0, min(PLANNING_SECONDS,
                        self.timeout - (monotonic() - execution_started) - RESERVE_ANSWER_SECONDS))
                    prepared = await acquire_evidence(document, question, history, selection, user_id,
                        prepared, self.planner, self.searcher, planning_seconds, self.max_rounds)
                    context = {**prepared.context, "run_id": run_id, "state": "running"}
                    yield {"type": "context", "data": context}
                answer = ""
                async with aclosing(self.provider(prepared.messages)) as stream:
                    async for text in stream:
                        if not isinstance(text, str):
                            raise ValueError("Provider returned a non-text chunk")
                        if len(answer) + len(text) > 24000:
                            raise ValueError("Reading output limit exceeded")
                        answer += text
                        if text:
                            yield {"type": "token", "data": text}
                if not answer.strip():
                    raise ValueError("Provider returned an empty answer")
                citations = check_citations(answer, context)
                if citations["invalid_ids"]:
                    raise ValueError("Answer cites evidence outside the final context")
                result = {**context, "state": "completed", "citations": citations,
                          "elapsed_ms": round((monotonic() - started) * 1000)}
                logger.info("reading completed run_id=%s mode=%s context_chars=%s citations=%s elapsed_ms=%s",
                            run_id, context["mode"], context["context_chars"],
                            result["citations"]["status"], result["elapsed_ms"])
                yield {"type": "context", "data": result}
        except (asyncio.CancelledError, GeneratorExit):
            logger.info("reading cancelled run_id=%s", run_id)
            raise
        except Exception:
            logger.exception("reading failed run_id=%s", run_id)
            raise
        finally:
            self.slots.release()
