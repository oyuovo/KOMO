"""KOMO AI Service — 配置"""

import os
import sys

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

# 启动时校验必要环境变量
if not DEEPSEEK_API_KEY:
    print("[FATAL] DEEPSEEK_API_KEY 未设置，请设置环境变量后重新启动", file=sys.stderr)
    sys.exit(1)

# 允许的 CORS 源（逗号分隔）
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001",
).split(",")
