"""DeepSeek API 客户端（兼容 OpenAI SDK）"""

from openai import AsyncOpenAI
from .config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

# 所有服务共用异步客户端，避免模型请求阻塞 FastAPI 的事件循环。
adeepseek = AsyncOpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
)
