"""每日推荐 — Pydantic Schema"""

from pydantic import BaseModel, Field


class RecommendationQuestion(BaseModel):
    """单条推荐问题"""

    text: str = Field(..., description="问题文本")
    dimension: str = Field(..., description="deepening | cross_domain | gap")
    related_knowledge_ids: list[str] = Field(default_factory=list)
    related_knowledge_titles: list[str] = Field(default_factory=list)
    missing_area: str = Field(default="", description="缺失领域描述")
    suggested_kb_id: str | None = Field(default=None, description="建议的 KB ID")


class DailyRecommendationRequest(BaseModel):
    """生成推荐请求"""

    user_id: str
    knowledge_summary: dict


class DailyRecommendationResponse(BaseModel):
    """推荐响应"""

    questions: list[RecommendationQuestion] = Field(default_factory=list)
