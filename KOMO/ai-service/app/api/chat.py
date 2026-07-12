"""对话 API — SSE 流式输出"""

import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..services.chat import chat_stream

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]


def _sse_encode(data: str) -> str:
    """将文本编码为 SSE data 字段。
    文本中的 \\n 用多行 data: 格式编码，避免和 SSE 协议分隔符 \\n\\n 冲突。"""
    if not data:
        return "data: \n\n"
    lines = data.split('\n')
    encoded = '\n'.join(f'data: {line}' for line in lines)
    return encoded + '\n\n'


@router.post("/stream")
async def stream_chat(req: ChatRequest):
    """SSE 流式对话"""
    if not req.messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    async def generate():
        try:
            async for token in chat_stream(req.messages):
                yield _sse_encode(token)
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Chat stream failed")
            yield f"data: [ERROR] AI 服务暂时不可用\n\n"

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
        logger.exception("Chat sync failed")
        raise HTTPException(status_code=500, detail="AI 服务暂时不可用")
