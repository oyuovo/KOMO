package com.komo.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 去重判定结果。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DedupResult {

    /** 是否判定为重复 */
    private boolean duplicate;

    /** 综合得分（0-1，越高越重复） */
    private double score;

    /** 匹配来源 */
    private String matchSource;  // "knowledge_base" or "pending_draft" or "none"

    /** 匹配的知识条目 ID */
    private String matchedEntryId;

    /** 匹配的草稿 ID */
    private String matchedDraftId;

    /** MLT 原始得分（用于调试） */
    private Double mltRawScore;

    /** 标题 LCS 得分 */
    private Double titleLcsScore;

    public static DedupResult noMatch() {
        return DedupResult.builder()
            .duplicate(false)
            .score(0.0)
            .matchSource("none")
            .build();
    }

    public static DedupResult knowledgeMatch(String entryId, double score, double mlt, double lcs) {
        return DedupResult.builder()
            .duplicate(score > 0.6)
            .score(score)
            .matchSource("knowledge_base")
            .matchedEntryId(entryId)
            .mltRawScore(mlt)
            .titleLcsScore(lcs)
            .build();
    }

    public static DedupResult draftMatch(String draftId, double score) {
        return DedupResult.builder()
            .duplicate(score > 0.6)
            .score(score)
            .matchSource("pending_draft")
            .matchedDraftId(draftId)
            .build();
    }
}
