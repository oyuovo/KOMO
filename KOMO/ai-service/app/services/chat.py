"""对话服务 — 封装 DeepSeek 调用"""

import re
from typing import AsyncGenerator
from ..core.clients import adeepseek
from ..core.config import DEEPSEEK_MODEL

# DeepSeek 偶发将内部安全审查标记 <ds_safety>...</ds_safety> 泄漏进 content
# （官方 API 不剥离，应用层必须过滤；同类的 DSML 工具调用标记泄漏见社区案例）。
_SAFETY_OPEN = "<ds_safety>"
_SAFETY_CLOSE = "</ds_safety>"
_SAFETY_PATTERN = re.compile(r"<ds_safety>.*?</ds_safety>", re.DOTALL)


def _max_partial_overlap(text: str, marker: str) -> int:
    """text 尾部与 marker 前缀的最长重叠长度（标记可能被 chunk 边界切开，需暂存）。"""
    for k in range(min(len(text), len(marker) - 1), 0, -1):
        if text.endswith(marker[:k]):
            return k
    return 0


async def chat_stream(
    messages: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    """流式对话，逐 token 产出。

    必须使用 AsyncOpenAI 异步迭代：同步客户端的阻塞迭代会卡死事件循环，
    导致 uvicorn 连响应头都发不出去，整个回复憋到生成结束一次性倾泻。
    （已实测复现：同步迭代时 700+ chunk 全部在生成完成时刻到达。）
    """
    response = await adeepseek.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=messages,
        stream=True,
        temperature=0.7,
        max_tokens=4096,
    )

    # 跨 chunk 安全的 ds_safety 过滤状态机
    inside_safety = False
    pending = ""  # 尾部可能是被切开的不完整标记，暂存等下一个 chunk

    async for chunk in response:
        delta = chunk.choices[0].delta
        if not delta.content:
            # 思考模式下 DeepSeek 先发 reasoning_content（content 为 None），跳过
            continue
        text = pending + delta.content
        pending = ""
        out = ""
        while text:
            if inside_safety:
                idx = text.find(_SAFETY_CLOSE)
                if idx == -1:
                    keep = _max_partial_overlap(text, _SAFETY_CLOSE)
                    if keep:
                        pending = text[-keep:]
                    text = ""
                else:
                    text = text[idx + len(_SAFETY_CLOSE):]
                    inside_safety = False
            else:
                idx = text.find(_SAFETY_OPEN)
                if idx == -1:
                    keep = _max_partial_overlap(text, _SAFETY_OPEN)
                    if keep:
                        out += text[:-keep]
                        pending = text[-keep:]
                    else:
                        out += text
                    text = ""
                else:
                    out += text[:idx]
                    text = text[idx + len(_SAFETY_OPEN):]
                    inside_safety = True
        if out:
            yield out

    # 流结束：未闭合的 ds_safety 之后的内容全部丢弃（审查文本不该给用户）；
    # 非标记态的 pending 是正常文本，补发
    if pending and not inside_safety:
        yield pending


async def chat_sync(
    messages: list[dict[str, str]],
) -> str:
    """非流式对话，返回完整响应"""
    response = await adeepseek.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=messages,
        stream=False,
        temperature=0.7,
        max_tokens=4096,
    )
    content = response.choices[0].message.content or ""
    return _SAFETY_PATTERN.sub("", content)
