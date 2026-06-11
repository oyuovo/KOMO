"""知识提取服务 — 从 AI 对话中提取结构化知识"""

import json
import re
from ..core.clients import deepseek
from ..core.config import DEEPSEEK_MODEL
from ..prompts.extraction import EXTRACTION_SYSTEM_PROMPT


async def extract_knowledge(
    messages: list[dict[str, str]],
) -> list[dict]:
    """
    从对话消息中提取知识点。

    Args:
        messages: 对话消息列表，格式 [{"role": "user/assistant", "content": "..."}]

    Returns:
        知识点列表，每个包含 title, content, confidence
    """
    # 构建提取请求：系统提示 + 对话内容
    extraction_messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "请从以下对话中提取知识点（仅从 assistant 的回复中提取）：\n\n"
            + "\n".join(
                f"[{m['role']}]: {m['content']}" for m in messages[-6:]  # 只取最近 6 条消息
            ),
        },
    ]

    try:
        response = deepseek.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=extraction_messages,
            stream=False,
            temperature=0.3,  # 低温度以获得更一致的提取结果
            max_tokens=2048,
        )
        content = response.choices[0].message.content.strip()

        # 解析 JSON — 尝试提取 JSON 数组
        knowledge_points = _parse_json_response(content)

        # 过滤低置信度
        filtered = [
            kp
            for kp in knowledge_points
            if isinstance(kp, dict)
            and kp.get("title")
            and kp.get("content")
            and kp.get("confidence", 0) >= 0.6
        ]

        return filtered
    except Exception as e:
        print(f"[extraction] Error: {e}")
        return []


def _parse_json_response(text: str) -> list:
    """尝试从 LLM 回复中解析 JSON 数组"""
    # 尝试直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试提取 ```json ... ``` 代码块
    code_block = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if code_block:
        try:
            return json.loads(code_block.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 尝试提取 [...] 部分
    array_match = re.search(r"\[[\s\S]*\]", text)
    if array_match:
        try:
            return json.loads(array_match.group(0))
        except json.JSONDecodeError:
            pass

    print(f"[extraction] Could not parse JSON from: {text[:200]}...")
    return []
