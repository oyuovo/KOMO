"""KOMO AI Service — 配置"""

import os

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-v4-flash"  # DeepSeek V4 Flash — deepseek-chat 已于 2026-07-24 停用


