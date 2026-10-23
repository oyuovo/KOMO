from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class ReadingDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=2_000_000)


class ReadingTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(max_length=24000)


class ReadingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str = Field(min_length=1, max_length=100)
    document: ReadingDocument
    question: str = Field(min_length=1, max_length=20000)
    selection: str = Field(default="", max_length=20000)
    history: list[ReadingTurn] = Field(default_factory=list, max_length=20)
