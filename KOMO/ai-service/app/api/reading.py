"""Internal endpoint: Java supplies an ownership-checked document snapshot."""
import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from ..core.clients import adeepseek
from ..core.config import DEEPSEEK_MODEL
from ..reading.core import Document
from ..reading.runtime import ReadingRuntime
from ..schemas.reading import ReadingRequest
from ..retrieval.reading import prepare_hybrid, search_document
from ..retrieval.security import require_internal_token

router = APIRouter(prefix="/api/reading", tags=["reading"], dependencies=[Depends(require_internal_token)])
logger = logging.getLogger(__name__)


class ReadingGenerationIncomplete(ValueError):
    """Retain the provider's safe finish code for diagnostics, not HTTP responses."""
    def __init__(self, finish_reason: str):
        super().__init__("Reading generation did not finish normally: " + finish_reason)
        self.finish_reason = finish_reason


async def model_stream(messages):
    client = adeepseek.with_options(timeout=60, max_retries=1)
    stream = await client.chat.completions.create(
        model=DEEPSEEK_MODEL, messages=messages, stream=True, temperature=0.2, max_tokens=2048,
        extra_body={"thinking": {"type": "disabled"}})
    finished = False
    async with stream:
        async for chunk in stream:
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            if choice.finish_reason and choice.finish_reason != "stop":
                raise ReadingGenerationIncomplete(choice.finish_reason)
            if choice.finish_reason == "stop":
                finished = True
            if choice.delta.content:
                yield choice.delta.content
    if not finished:
        raise ReadingGenerationIncomplete("missing_stop")


async def model_plan(messages, tools):
    # No provider retries here: two harness rounds mean at most two planner requests.
    client = adeepseek.with_options(timeout=20, max_retries=0)
    response = await client.chat.completions.create(model=DEEPSEEK_MODEL, messages=messages,
        tools=tools, tool_choice="auto", stream=False, temperature=0.2, max_tokens=768,
        extra_body={"thinking": {"type": "disabled"}})
    if not response.choices:
        raise ReadingGenerationIncomplete("missing_choice")
    choice = response.choices[0]
    if choice.finish_reason not in {"stop", "tool_calls"}:
        raise ReadingGenerationIncomplete(choice.finish_reason or "missing_stop")
    calls = choice.message.tool_calls or []
    if (choice.finish_reason == "tool_calls") != bool(calls):
        raise ReadingGenerationIncomplete("inconsistent_tool_finish")
    return {"tool_calls": [c.model_dump(include={"id", "type", "function"}) for c in calls]}


runtime = ReadingRuntime(model_stream, preparer=prepare_hybrid, planner=model_plan, searcher=search_document)


def events(req):
    return runtime.stream(Document(**req.document.model_dump()), req.question,
                          [m.model_dump() for m in req.history], req.selection, req.user_id)


def sse(event):
    return f"event: {event['type']}\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"


@router.post("/stream")
async def stream_reading(req: ReadingRequest):
    async def generate():
        try:
            async for event in events(req):
                yield sse(event)
            yield 'event: done\ndata: {}\n\n'
        except Exception:
            logger.exception("Reading stream failed")
            yield sse({"type": "error", "data": "阅读回答未完成，请稍后重试。"})
    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/sync")
async def sync_reading(req: ReadingRequest):
    answer, context = "", None
    try:
        async for event in events(req):
            if event["type"] == "token":
                answer += event["data"]
            else:
                context = event["data"]
        return {"content": answer, "readingContext": context}
    except asyncio.TimeoutError as error:
        logger.warning("Reading request timed out", exc_info=True)
        raise HTTPException(503, "阅读服务繁忙或超时，请稍后重试。") from error
    except Exception as error:
        logger.exception("Reading request failed")
        raise HTTPException(502, "阅读回答未完成，请稍后重试。") from error
