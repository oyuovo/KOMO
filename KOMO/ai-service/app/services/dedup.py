"""语义去重服务 — 调用 DeepSeek 判断知识重复"""

import json
import re
from ..core.clients import deepseek
from ..core.config import DEEPSEEK_MODEL
from ..prompts.dedup import DEDUP_SYSTEM_PROMPT


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
            temperature=0.1,
            max_tokens=512,
        )
        content = response.choices[0].message.content.strip()
        return _parse_json_response(content)
    except Exception as e:
        print(f"[dedup] Error: {e}")
        return {"verdict": "NEW", "confidence": 0.5, "reason": f"调用失败: {e}", "matched_index": -1}


def _parse_json_response(text: str) -> dict:
    """解析 LLM 返回的 JSON，含多个兜底策略"""
    # 策略 1：直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # 策略 2：提取代码块
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # 策略 3：提取第一个 JSON 对象
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {"verdict": "NEW", "confidence": 0.5, "reason": "无法解析", "matched_index": -1}
