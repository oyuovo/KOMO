"""知识提取服务 — 从 AI 对话中提取结构化知识"""

import json
import re
import logging
from ..core.clients import deepseek
from ..core.config import DEEPSEEK_MODEL
from ..prompts.extraction import EXTRACTION_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# ARTICLE 最低纯文本字数门槛（去 Markdown 标记后）
ARTICLE_MIN_PLAIN_CHARS = 500


async def extract_knowledge(
    messages: list[dict[str, str]],
) -> list[dict]:
    """
    从对话消息中提取知识点（异步模式 — 使用全量消息，不做截断）。

    Args:
        messages: 对话消息列表，格式 [{"role": "user/assistant", "content": "..."}]

    Returns:
        知识点列表，每个包含 type, title, content, confidence
    """
    # 构建对话摘要供 LLM 判断特征
    total_assistant_chars = sum(
        len(m.get("content", "")) for m in messages if m.get("role") == "assistant"
    )
    total_turns = len([m for m in messages if m.get("role") == "user"])
    has_code = any("```" in m.get("content", "") for m in messages)

    conversation_context = (
        f"对话特征 — 总轮数: {total_turns}, "
        f"assistant 总字数: {total_assistant_chars}, "
        f"含代码块: {has_code}"
    )
    logger.info("[extraction] %s", conversation_context)

    # 构建提取请求：系统提示 + 全量对话内容（异步模式，不赶时间）
    extraction_messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"{conversation_context}\n\n"
                "请从以下对话中提取知识点（仅从 assistant 的回复中提取）：\n\n"
                + "\n".join(
                    f"[{m['role']}]: {m['content']}" for m in messages
                )
            ),
        },
    ]

    try:
        response = deepseek.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=extraction_messages,
            stream=False,
            temperature=0.3,   # 低温度以获得更一致的提取结果
            max_tokens=12288,   # 异步模式：充足 token 支持多篇长文提取
        )
        content = response.choices[0].message.content.strip()

        # 解析 JSON — 尝试提取 JSON 数组
        knowledge_points = _parse_json_response(content)

        # 过滤低置信度 + 统计类型分布 + 质量关卡
        filtered = []
        type_counts = {"ARTICLE": 0, "FRAGMENT": 0, "SUPPLEMENT": 0}
        article_lengths = []

        for kp in knowledge_points:
            if not isinstance(kp, dict):
                continue
            if not kp.get("title") or not kp.get("content"):
                continue
            if kp.get("confidence", 0) < 0.6:
                continue

            extract_type = kp.get("type", "FRAGMENT")
            if extract_type not in type_counts:
                extract_type = "FRAGMENT"

            # 质量关卡：ARTICLE 纯文本 < 500 字 → 自动降级为 FRAGMENT
            if extract_type == "ARTICLE":
                plain_len = _plain_text_length(kp.get("content", ""))
                article_lengths.append(plain_len)
                if plain_len < ARTICLE_MIN_PLAIN_CHARS:
                    logger.warning(
                        "[extraction] ARTICLE 内容过短(%d字)，降级为 FRAGMENT: %s",
                        plain_len, kp.get("title", "?")
                    )
                    extract_type = "FRAGMENT"

            kp["type"] = extract_type
            type_counts[extract_type] += 1
            filtered.append(kp)

        if filtered:
            log_parts = [
                f"提取了 {len(filtered)} 条",
                f"ARTICLE={type_counts['ARTICLE']}",
                f"FRAGMENT={type_counts['FRAGMENT']}",
                f"SUPPLEMENT={type_counts['SUPPLEMENT']}",
            ]
            if article_lengths:
                log_parts.append(f"ARTICLE lengths={article_lengths}")
            logger.info("[extraction] %s", ", ".join(log_parts))

        return filtered
    except Exception:
        logger.exception("[extraction] Knowledge extraction failed")
        raise


def _plain_text_length(markdown: str) -> int:
    """去除 Markdown 标记后返回纯文本字符数（不含空白）。"""
    if not markdown:
        return 0
    text = markdown
    # 代码块
    text = re.sub(r"```[\s\S]*?```", " ", text)
    # 行内代码
    text = re.sub(r"`[^`]+`", " ", text)
    # 图片
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    # 链接 — 保留文字
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    # 标题标记
    text = re.sub(r"#+\s*", "", text)
    # 粗体/斜体/删除线/引用标记
    text = re.sub(r"[*_~>]", "", text)
    # 列表标记
    text = re.sub(r"^[\s]*[-*+]\s", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\s]*\d+\.\s", "", text, flags=re.MULTILINE)
    # 合并空白后统计有效字符
    text = re.sub(r"\s+", "", text)
    return len(text)


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

    logger.warning("[extraction] Could not parse JSON from: %s...", text[:200])
    return []
