"""语义去重服务 — 调用 DeepSeek 判断知识重复"""

import logging
from pydantic import ValidationError
from ..core.clients import deepseek
from ..core.config import DEEPSEEK_MODEL
from ..core.json_utils import parse_llm_json
from ..schemas.dedup import DedupVerdict
from ..prompts.dedup import DEDUP_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def check_semantic_duplicate(
    candidate_title: str,
    candidate_content: str,
    existing_knowledge: list[dict],
) -> dict:
    """
    使用 LLM 判断候选知识点与已有知识的关系。

    Args:
        candidate_title: 候选知识标题
        candidate_content: 候选知识正文
        existing_knowledge: 已有知识列表 [{"id": "...", "title": "...", "content_plain": "..."}]

    Returns:
        {"verdict": "DUPLICATE|SUPPLEMENTS|CONTRADICTS|NEW", "confidence": float, "reason": str, "matched_index": int}
    """
    if not existing_knowledge:
        return {"verdict": "NEW", "confidence": 1.0, "reason": "知识库为空", "matched_index": -1}

    # 构建已有知识列表（最多 8 条）
    existing_text = "\n\n".join(
        f"[{i}] 标题: {k.get('title', '')}\n内容: {k.get('content_plain', k.get('content', ''))[:300]}"
        for i, k in enumerate(existing_knowledge[:8])
    )

    user_prompt = f"""候选知识点：
标题: {candidate_title}
内容: {candidate_content[:500]}

已有知识（共 {len(existing_knowledge)} 条）：
{existing_text}

请判断候选知识点与已有知识的关系。"""

    try:
        response = deepseek.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": DEDUP_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            stream=False,
            temperature=0,                      # JSON mode 推荐 0 以获取确定性输出
            max_tokens=512,
            response_format={"type": "json_object"},        # 强制 LLM 输出合法 JSON
            extra_body={"thinking": {"type": "disabled"}},  # 关闭推理链
        )

        finish_reason = response.choices[0].finish_reason
        if finish_reason == "length":
            logger.warning("[dedup] LLM 输出被截断 (finish_reason=length)")

        content = response.choices[0].message.content.strip()

        # 解析 JSON + Pydantic Schema 校验
        raw = parse_llm_json(content, expect_array=False)
        return _validate_dedup_result(raw)

    except Exception:
        logger.exception("[dedup] Semantic duplicate check failed")
        return {
            "verdict": "NEW",
            "confidence": 0.5,
            "reason": "LLM 去重服务暂时不可用",
            "matched_index": -1,
        }


def _validate_dedup_result(raw: dict) -> dict:
    """用 Pydantic Schema 校验 LLM 去重输出。

    校验失败时返回安全兜底值 (NEW, 0.5 confidence)。
    """
    try:
        verdict = DedupVerdict.model_validate(raw)
        return verdict.model_dump()
    except ValidationError as e:
        logger.warning(
            "[dedup] Schema 校验失败: %s — raw: %.300s",
            e.errors(), raw
        )
        return {
            "verdict": "NEW",
            "confidence": 0.5,
            "reason": "Schema 校验失败",
            "matched_index": -1,
        }
