"""DeepSeek API 客户端（兼容 OpenAI SDK）"""

from openai import OpenAI
from .config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

deepseek = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
)
