"""每日推荐 API"""

import logging

from fastapi import APIRouter, HTTPException
from ..schemas.recommendation import DailyRecommendationRequest
from ..services.recommendation import generate_daily_questions

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])
logger = logging.getLogger(__name__)


@router.post("/daily")
async def daily_recommendations(req: DailyRecommendationRequest):
    """基于用户知识库生成每日自查问题"""
    if not req.user_id:
        raise HTTPException(status_code=400, detail="user_id 不能为空")

    try:
        questions = await generate_daily_questions(
            user_id=req.user_id,
            knowledge_summary=req.knowledge_summary,
        )
        return {"questions": questions, "count": len(questions)}
    except Exception as exc:
        logger.exception("[recommendations] Daily generation failed")
        raise HTTPException(status_code=500, detail="推荐问题生成服务暂时不可用") from exc
