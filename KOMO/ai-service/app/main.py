"""KOMO AI Service — FastAPI 入口"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.api.extraction import router as extraction_router
from app.api.dedup import router as dedup_router
from app.api.recommendation import router as recommendation_router
from app.core.config import ALLOWED_ORIGINS

# 输出应用日志，使提取候选数、过滤数量和异常可在本地及容器日志中追踪。
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="KOMO AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(extraction_router)
app.include_router(dedup_router)
app.include_router(recommendation_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "komo-ai"}
