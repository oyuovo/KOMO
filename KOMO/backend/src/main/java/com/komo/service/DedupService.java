package com.komo.service;

import com.komo.dto.DedupResult;
import com.komo.entity.KnowledgeDraft;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 知识去重服务。
 * Layer 1: 混合检索召回候选
 * Layer 2: 标题 LCS 兜底
 * Layer 3: DeepSeek LLM 语义判定（异步）
 */
@Service
@RequiredArgsConstructor
public class DedupService {

    private final KnowledgeRetrievalService indexService;
    private final KnowledgeDraftService draftService;

    /**
     * 高分候选直接标记为疑似重复，保留在草稿箱交给用户审阅。
     */
    private static final double SUSPECTED_DUPLICATE_THRESHOLD = 0.65;
    private static final double NEW_THRESHOLD = 0.2;

    /**
     * 综合去重检查（Layer 1 + Layer 2）。
     * 检查候选草稿是否与已有知识库或待处理草稿重复。
     */
    public DedupResult checkDuplicate(UUID userId, String title, String contentPlain) {
        // ===== Layer 1: 混合检索（排名分数不能当作重复概率） =====
        List<Map<String, Object>> similar = indexService.findSimilar(userId, title, contentPlain, 5);
        DedupResult best = DedupResult.noMatch();

        for (Map<String, Object> entry : similar) {
            Double retrievalScore = entry.get("_score") instanceof Number
                ? ((Number) entry.get("_score")).doubleValue() : 0;
            String entryTitle = (String) entry.getOrDefault("title", "");
            String entryId = (String) entry.get("_id");

            // Layer 2: 标题 LCS 兜底
            double lcsScore = computeTitleLcs(title, entryTitle);

            // 召回候选至少进入人工/模型审阅；只有标题重合度触发高分提示。
            double combined = Math.max(0.3, lcsScore);

            if (combined > best.getScore()) {
                best = DedupResult.knowledgeMatch(entryId, combined, retrievalScore, lcsScore);
            }
        }

        // ===== 检查待处理草稿 =====
        List<KnowledgeDraft> pending = draftService.listAllPending(userId);
        for (KnowledgeDraft draft : pending) {
            double lcs = computeTitleLcs(title, draft.getTitle());
            if (lcs > best.getScore()) {
                best = DedupResult.draftMatch(draft.getId().toString(), lcs);
            }
        }

        return best;
    }

    /**
     * 标题最长公共子串相似度。
     * 中文友好 — 去除标点和空格后做字符级 LCS 比较。
     */
    private double computeTitleLcs(String t1, String t2) {
        if (t1 == null || t2 == null) return 0;
        String a = normalize(t1);
        String b = normalize(t2);
        if (a.isEmpty() || b.isEmpty()) return 0;
        if (a.equals(b)) return 1.0;
        if (a.contains(b) || b.contains(a)) return 0.85;
        int lcs = longestCommonSubstring(a, b);
        return (double) lcs / Math.min(a.length(), b.length());
    }

    private String normalize(String s) {
        return s.toLowerCase()
            .replaceAll("[\\s，,、。；：！？…—\\-()\\[\\]【】\"'「」『』]+", "");
    }

    private int longestCommonSubstring(String a, String b) {
        int max = 0;
        int[] prev = new int[b.length() + 1];
        for (int i = 1; i <= a.length(); i++) {
            int[] curr = new int[b.length() + 1];
            for (int j = 1; j <= b.length(); j++) {
                if (a.charAt(i - 1) == b.charAt(j - 1)) {
                    curr[j] = prev[j - 1] + 1;
                    max = Math.max(max, curr[j]);
                }
            }
            prev = curr;
        }
        return max;
    }

    /** 高相似度仅是审阅提示，不代表内容重复已被确认。 */
    public boolean isSuspectedDuplicate(DedupResult result) {
        return result.getScore() > SUSPECTED_DUPLICATE_THRESHOLD;
    }

    /** 判定：是否需要 LLM 进一步判断 */
    public boolean needsLlmReview(DedupResult result) {
        return result.getScore() >= NEW_THRESHOLD && result.getScore() <= SUSPECTED_DUPLICATE_THRESHOLD;
    }
}
