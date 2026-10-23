"""Trusted Java gateway supplies the current authorized document manifest."""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.reading.core import Document
from app.schemas.reading import ReadingDocument
from app.retrieval.engine import get_retrieval
from app.retrieval.security import require_internal_token

router = APIRouter(prefix="/api/retrieval", tags=["retrieval"], dependencies=[Depends(require_internal_token)])
logger = logging.getLogger(__name__)


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")


class Scope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str = Field(min_length=1, max_length=100)
    manifest: list[Revision] = Field(max_length=500)

    @model_validator(mode="after")
    def unique_documents(self):
        if len({m.id for m in self.manifest}) != len(self.manifest):
            raise ValueError("Duplicate document in manifest")
        return self


class Search(Scope):
    query: str = Field(min_length=1, max_length=20000)
    limit: int = Field(default=12, ge=1, le=40)
    strategy: Literal["hybrid", "lexical", "dense"] = "hybrid"


class Index(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str = Field(min_length=1, max_length=100)
    document: ReadingDocument


def execute(action):
    try:
        return action(get_retrieval())
    except Exception as error:
        logger.exception("Retrieval operation failed")
        raise HTTPException(503, "检索未完成，请检查服务状态后重试。") from error


@router.post("/missing")
def missing(req: Scope):
    return execute(lambda engine: {"missing": engine.missing(req.user_id, [m.model_dump() for m in req.manifest])})


@router.post("/index")
def index(req: Index):
    return execute(lambda engine: {"indexed": engine.index(req.user_id, Document(**req.document.model_dump())) is None})


@router.post("/search")
def search(req: Search):
    return execute(lambda engine: {"hits": engine.search(req.user_id, [m.model_dump() for m in req.manifest],
                                                       req.query, req.limit, req.strategy)})


@router.post("/prune")
def prune(req: Scope):
    return execute(lambda engine: {"removed": engine.prune(req.user_id, [m.model_dump() for m in req.manifest])})
