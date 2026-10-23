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

    /** 是否为较强的相似候选，可提示关联；不代表已确认重复。 */
    private boolean strongMatch;

    /** 启发式综合分数（0-1），不是重复概率。 */
    private double score;

    /** 匹配来源 */
    private String matchSource;  // "knowledge_base" or "pending_draft" or "none"

    /** 匹配的知识条目 ID */
    private String matchedEntryId;

    /** 匹配的草稿 ID */
    private String matchedDraftId;

    /** 融合排名原始得分（用于调试，不是重复概率） */
    private Double retrievalRawScore;

    /** 标题 LCS 得分 */
    private Double titleLcsScore;

    public static DedupResult noMatch() {
        return DedupResult.builder()
            .strongMatch(false)
            .score(0.0)
            .matchSource("none")
            .build();
    }

    public static DedupResult knowledgeMatch(String entryId, double score, double retrieval, double lcs) {
        return DedupResult.builder()
            .strongMatch(score > 0.6)
            .score(score)
            .matchSource("knowledge_base")
            .matchedEntryId(entryId)
            .retrievalRawScore(retrieval)
            .titleLcsScore(lcs)
            .build();
    }

    public static DedupResult draftMatch(String draftId, double score) {
        return DedupResult.builder()
            .strongMatch(score > 0.6)
            .score(score)
            .matchSource("pending_draft")
            .matchedDraftId(draftId)
            .build();
    }
}
