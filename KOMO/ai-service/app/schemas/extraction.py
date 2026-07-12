"""知识提取结果的 Pydantic Schema — 用于校验 LLM JSON 输出。"""

from pydantic import BaseModel, Field
from typing import Literal


class KnowledgePoint(BaseModel):
    """单条提取的知识点。"""

    type: Literal["ARTICLE", "FRAGMENT", "SUPPLEMENT"]
    title: str = Field(min_length=1, max_length=100, description="知识标题")
    content: str = Field(min_length=1, max_length=50_000, description="知识正文（Markdown）")
    confidence: float = Field(ge=0.0, le=1.0, description="置信度，低于 0.6 会被丢弃")


class ExtractionResult(BaseModel):
    """LLM 提取响应的顶层结构。"""

    knowledge_points: list[KnowledgePoint] = Field(
        default_factory=list, description="提取的知识点列表"
    )
