"""对话 API — SSE 流式输出"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..services.chat import chat_stream

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]


@router.post("/stream")
async def stream_chat(req: ChatRequest):
    """SSE 流式对话"""
    if not req.messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    async def generate():
        try:
            async for token in chat_stream(req.messages):
                yield f"data: {token}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sync")
async def sync_chat(req: ChatRequest):
    """非流式对话"""
    if not req.messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    from ..services.chat import chat_sync

    try:
        content = await chat_sync(req.messages)
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
