"""去重 API"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.dedup import check_semantic_duplicate

router = APIRouter(prefix="/api/dedup", tags=["dedup"])


class DedupRequest(BaseModel):
    candidate_title: str
    candidate_content: str
    existing_knowledge: list[dict]


@router.post("/check")
async def check(req: DedupRequest):
    """检查候选知识点是否与已有知识重复"""
    if not req.candidate_title:
        raise HTTPException(status_code=400, detail="title 不能为空")
    try:
        result = await check_semantic_duplicate(
            req.candidate_title,
            req.candidate_content,
            req.existing_knowledge,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
