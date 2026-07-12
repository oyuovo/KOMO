"""去重判定结果的 Pydantic Schema — 用于校验 LLM JSON 输出。"""

from pydantic import BaseModel, Field
from typing import Literal


class DedupVerdict(BaseModel):
    """去重判定结果。"""

    verdict: Literal["DUPLICATE", "SUPPLEMENTS", "CONTRADICTS", "NEW"]
    confidence: float = Field(ge=0.0, le=1.0, description="置信度")
    reason: str = Field(min_length=1, max_length=200, description="判定理由")
    matched_index: int = Field(ge=-1, description="最匹配的已有知识索引，-1 表示无匹配")
