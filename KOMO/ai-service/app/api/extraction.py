"""知识提取 API"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.extraction import extract_knowledge

router = APIRouter(prefix="/api/extraction", tags=["extraction"])
logger = logging.getLogger(__name__)


class ExtractRequest(BaseModel):
    messages: list[dict[str, str]]


@router.post("/extract")
async def extract(req: ExtractRequest):
    """从对话中提取知识点"""
    if not req.messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    try:
        knowledge_points = await extract_knowledge(req.messages)
        return {"knowledge_points": knowledge_points, "count": len(knowledge_points)}
    except Exception as exc:
        logger.exception("Knowledge extraction endpoint failed")
        raise HTTPException(status_code=500, detail="知识提取服务暂时不可用") from exc
