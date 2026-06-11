"""知识提取 API"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.extraction import extract_knowledge

router = APIRouter(prefix="/api/extraction", tags=["extraction"])


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
