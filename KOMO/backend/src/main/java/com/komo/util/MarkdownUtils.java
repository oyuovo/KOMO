package com.komo.util;

/**
 * Markdown 文本工具。
 * 知识条目纯文本化（contentPlain）与字数统计的统一实现，
 * 替代原先散落在 KnowledgeService / KnowledgeDraftService / ConversationService 中的重复正则。
 */
public final class MarkdownUtils {

    private MarkdownUtils() {
    }

    /** 简易 Markdown 清洗：移除格式标记，保留纯文本。用于 ES 索引与全文搜索。 */
    public static String stripMarkdown(String markdown) {
        if (markdown == null) {
            return "";
        }
        return markdown
            .replaceAll("#{1,6}\\s", "")
            .replaceAll("[*_~`>]", "")
            .replaceAll("\\[([^]]+)]\\([^)]+\\)", "$1")
            .replaceAll("!\\[[^]]*]\\([^)]+\\)", "")
            .replaceAll("```[\\s\\S]*?```", "")
            .replaceAll("\\s+", " ")
            .trim();
    }

    /** 去除 Markdown 标记，返回纯文本字符数。用于 ARTICLE 长度门槛校验。 */
    public static int plainTextLength(String markdown) {
        if (markdown == null) return 0;
        String text = markdown
            .replaceAll("```[\\s\\S]*?```", " ")   // 代码块
            .replaceAll("`[^`]+`", " ")              // 行内代码
            .replaceAll("!\\[[^]]*]\\([^)]*\\)", " ") // 图片
            .replaceAll("\\[[^]]*]\\([^)]*\\)", "$1") // 链接保留文字
            .replaceAll("#+\\s*", "")                 // 标题标记
            .replaceAll("[*_~>]", "")                 // 粗体/斜体/删除线/引用
            .replaceAll("^[\\s]*[-*+]\\s", "")        // 无序列表
            .replaceAll("^[\\s]*\\d+\\.\\s", "")      // 有序列表
            .replaceAll("\\s+", "");                  // 合并空白，统计有效字符
        return text.length();
    }
}
