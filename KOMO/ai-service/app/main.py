"""KOMO AI Service — FastAPI 入口"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.api.extraction import router as extraction_router

app = FastAPI(title="KOMO AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(extraction_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "komo-ai"}
