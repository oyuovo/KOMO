"""对话服务 — 封装 DeepSeek 调用"""

from typing import AsyncGenerator
from ..core.clients import deepseek
from ..core.config import DEEPSEEK_MODEL


async def chat_stream(
    messages: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    """流式对话，逐 token 产出。
    将 token 缓冲后批量发送，避免单独的 \\n token 与 SSE 协议分隔符冲突。"""
    response = deepseek.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=messages,
        stream=True,
        temperature=0.7,
        max_tokens=4096,
    )
    buf = ""
    for chunk in response:
        delta = chunk.choices[0].delta
        if delta.content:
            buf += delta.content
            # 积累到含换行或达到阈值时刷出，避免单独 \\n 破坏 SSE
            if len(buf) >= 24 or '\n' in buf:
                yield buf
                buf = ""
    if buf:
        yield buf


async def chat_sync(
    messages: list[dict[str, str]],
) -> str:
    """非流式对话，返回完整响应"""
    response = deepseek.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=messages,
        stream=False,
        temperature=0.7,
        max_tokens=4096,
    )
    return response.choices[0].message.content
