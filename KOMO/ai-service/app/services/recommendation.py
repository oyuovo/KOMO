"""每日推荐服务 — 调用 DeepSeek 生成自查问题"""

import json
import logging

from pydantic import ValidationError
from ..core.clients import deepseek
from ..core.config import DEEPSEEK_MODEL
from ..core.json_utils import parse_llm_json
from ..schemas.recommendation import RecommendationQuestion
from ..prompts.recommendation import DAILY_RECOMMENDATION_PROMPT

logger = logging.getLogger(__name__)


async def generate_daily_questions(
    user_id: str,
    knowledge_summary: dict,
) -> list[dict]:
    """
    基于用户知识库概况生成每日自查问题。

    Args:
        user_id: 用户 ID（仅用于日志）
        knowledge_summary: {kbs, recent_entries, recent_topics, dismissed_topics}

    Returns:
        问题列表，每个包含 text, dimension, related_knowledge_ids 等字段
    """
    kb_list = knowledge_summary.get("kbs", [])
    entry_count = len(knowledge_summary.get("recent_entries", []))

    # 知识不足时直接返回空列表，不浪费 API 调用
    if entry_count < 5:
        logger.info(
            "[recommendation] user=%s 知识条目不足 (%d<5)，跳过生成",
            user_id, entry_count,
        )
        return []

    summary_text = _format_knowledge_summary(knowledge_summary)
    logger.info("[recommendation] user=%s generating with %d entries, %d KBs",
                user_id, entry_count, len(kb_list))

    messages = [
        {"role": "system", "content": DAILY_RECOMMENDATION_PROMPT},
        {"role": "user", "content": summary_text},
    ]

    try:
        response = deepseek.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=messages,
            stream=False,
            temperature=0.7,
            max_tokens=2048,
            response_format={"type": "json_object"},
            extra_body={"thinking": {"type": "disabled"}},
        )

        content = response.choices[0].message.content.strip()
        raw_data = parse_llm_json(content, expect_array=False)

        questions_raw = raw_data.get("questions", []) if isinstance(raw_data, dict) else []

        validated = []
        for item in questions_raw:
            if not isinstance(item, dict):
                continue
            try:
                q = RecommendationQuestion.model_validate(item)
                validated.append(q.model_dump())
            except ValidationError as e:
                logger.warning(
                    "[recommendation] Schema 校验失败: %s — data: %.200s",
                    e.errors(), item,
                )

        if validated:
            dimensions = [q.get("dimension") for q in validated]
            logger.info("[recommendation] user=%s generated %d questions: %s",
                        user_id, len(validated), dimensions)

        return validated

    except Exception:
        logger.exception("[recommendation] user=%s generation failed", user_id)
        raise


def _format_knowledge_summary(summary: dict) -> str:
    """将知识概况格式化为 LLM 可读的文本。"""
    parts = []

    kbs = summary.get("kbs", [])
    if kbs:
        parts.append("## 知识库")
        for kb in kbs:
            parts.append(f"- [{kb.get('id', '?')}] {kb.get('name', '未命名')}")

    entries = summary.get("recent_entries", [])
    if entries:
        parts.append("\n## 最近的知识条目")
        for e in entries:
            etype = e.get("entry_type", "FACT")
            parts.append(f"- [{e.get('id', '?')}] ({etype}) {e.get('title', '无标题')}")

    topics = summary.get("recent_topics", [])
    if topics:
        parts.append("\n## 最近的对话话题")
        for t in topics:
            parts.append(f"- {t}")

    dismissed = summary.get("dismissed_topics", [])
    if dismissed:
        parts.append("\n## 已被用户忽略的主题（避免重复）")
        for d in dismissed:
            parts.append(f"- {d}")

    return "\n".join(parts)
