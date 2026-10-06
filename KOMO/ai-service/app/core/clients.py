"""DeepSeek API 客户端（兼容 OpenAI SDK）"""

from openai import AsyncOpenAI, OpenAI
from .config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

deepseek = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
)

# 异步客户端 — SSE 流式必须用它：同步客户端的阻塞迭代会卡死事件循环，
# 导致整个响应憋到生成结束才一次性发出（伪流式）。
adeepseek = AsyncOpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
)
