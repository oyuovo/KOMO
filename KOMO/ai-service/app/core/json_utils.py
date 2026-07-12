"""LLM JSON 响应解析工具 — 统一 extraction 和 dedup 的解析逻辑。

json_object mode 启用后，LLM 输出保证为合法 JSON。回退策略仅在异常情况下使用。
"""

import json
import re
import logging
from typing import Union

logger = logging.getLogger(__name__)


def parse_llm_json(text: str, expect_array: bool = True) -> Union[list, dict]:
    """解析 LLM 响应中的 JSON，带多层回退策略。

    Args:
        text: LLM 原始响应文本
        expect_array: True → 期望返回 list；False → 期望返回 dict

    Returns:
        解析后的 list 或 dict；解析失败时返回 []（expect_array=True）或 {}（expect_array=False）
    """
    if not text:
        logger.warning("[json_utils] LLM 返回空文本")
        return [] if expect_array else {}

    # 策略 1：直接解析（json_object mode 下的预期路径）
    try:
        result = json.loads(text)
        if isinstance(result, (list, dict)):
            return result
        # 如果解析结果不是预期的容器类型，继续回退
        logger.warning("[json_utils] 直接解析结果类型异常: %s，尝试回退", type(result).__name__)
    except json.JSONDecodeError:
        pass

    # 策略 2：提取 markdown 代码块
    code_block = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if code_block:
        try:
            result = json.loads(code_block.group(1).strip())
            if isinstance(result, (list, dict)):
                return result
        except json.JSONDecodeError:
            pass

    # 策略 3：用正则提取最外层 JSON 结构
    pattern = r"\[[\s\S]*\]" if expect_array else r"\{[\s\S]*\}"
    match = re.search(pattern, text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    logger.warning(
        "[json_utils] 所有解析策略均失败 (expect_array=%s): %.300s",
        expect_array, text
    )
    return [] if expect_array else {}
