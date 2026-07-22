package com.komo.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.komo.entity.DailyRecommendation;
import com.komo.entity.KnowledgeBase;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.User;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.DailyRecommendationRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 每日推荐服务。
 * 调用 Python AI 服务生成自查问题，缓存到数据库，按天刷新。
 */
@Service
@RequiredArgsConstructor
public class DailyRecommendationService {

    private static final Logger log = LoggerFactory.getLogger(DailyRecommendationService.class);

    private final DailyRecommendationRepository recommendationRepository;
    private final KnowledgeRepository knowledgeRepository;
    private final KnowledgeBaseService knowledgeBaseService;
    private final UserService userService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${komo.ai.base-url}")
    private String aiBaseUrl;

    /**
     * 获取用户今天的推荐问题（有缓存则返回缓存，无缓存则生成）。
     */
    @Transactional
    public DailyRecommendation getTodayRecommendation(UUID userId) {
        // 检查用户是否启用了每日推荐
        User user = userService.findById(userId);
        if (Boolean.FALSE.equals(user.getDailyRecommendationEnabled())) {
            return null;
        }

        // 查找今天已有的活跃推荐
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        return recommendationRepository
            .findByUserIdAndStatusAndCreatedAtAfter(userId, "ACTIVE", todayStart)
            .orElse(null);
    }

    /**
     * 触发生成推荐问题（调用 AI 服务 + 入库）。
     * 如果今天已有活跃推荐，先将其标记为 DISMISSED。
     */
    @Transactional
    public DailyRecommendation generateTodayRecommendation(UUID userId) {
        User user = userService.findById(userId);
        if (Boolean.FALSE.equals(user.getDailyRecommendationEnabled())) {
            return null;
        }

        // 将旧的活跃推荐标记为已处理
        List<DailyRecommendation> oldActive = recommendationRepository
            .findByUserIdAndStatus(userId, "ACTIVE");
        for (DailyRecommendation old : oldActive) {
            old.setStatus("DISMISSED");
            recommendationRepository.save(old);
        }

        // 构建知识概况
        Map<String, Object> summary = buildKnowledgeSummary(userId);

        // 调用 Python AI 服务
        List<Map<String, Object>> questions = callAiRecommendation(userId.toString(), summary);

        if (questions.isEmpty()) {
            log.info("[daily-rec] user={} AI 未生成任何问题（知识不足或无合适话题）", userId);
            return null;
        }

        // 取第一个问题入库
        Map<String, Object> first = questions.get(0);
        DailyRecommendation rec = DailyRecommendation.builder()
            .userId(userId)
            .question((String) first.get("text"))
            .dimension((String) first.getOrDefault("dimension", "deepening"))
            .relatedKnowledgeTitles(toJson(first.get("related_knowledge_titles")))
            .missingArea((String) first.getOrDefault("missing_area", ""))
            .suggestedKbId(parseUUID((String) first.get("suggested_kb_id")))
            .status("ACTIVE")
            .build();

        rec = recommendationRepository.save(rec);
        log.info("[daily-rec] user={} 新推荐已入库 id={} dimension={}", userId, rec.getId(), rec.getDimension());
        return rec;
    }

    /**
     * 用户关闭一条推荐。
     */
    @Transactional
    public void dismiss(UUID recommendationId, UUID userId) {
        DailyRecommendation rec = findOwnRecommendation(recommendationId, userId);
        rec.setStatus("DISMISSED");
        recommendationRepository.save(rec);
    }

    /**
     * 用户点击"与 AI 探讨"后标记。
     */
    @Transactional
    public void markConversed(UUID recommendationId, UUID userId) {
        DailyRecommendation rec = findOwnRecommendation(recommendationId, userId);
        rec.setStatus("CONVERSED");
        recommendationRepository.save(rec);
    }

    // ── 私有方法 ──

    /** 构建用户知识库概况（供 AI 生成问题使用）。 */
    private Map<String, Object> buildKnowledgeSummary(UUID userId) {
        // 用户的知识库列表
        List<KnowledgeBase> kbs = knowledgeBaseService.listForUser();
        List<Map<String, String>> kbList = kbs.stream()
            .map(kb -> Map.of("id", kb.getId().toString(), "name", kb.getName()))
            .collect(Collectors.toList());

        // 最近 20 条知识条目（标题 + 类型）
        List<KnowledgeEntry> recentEntries = knowledgeRepository
            .findByUserIdAndFilters(userId, null, null, null,
                PageRequest.of(0, 20))
            .getContent();
        List<Map<String, String>> entryList = recentEntries.stream()
            .map(e -> Map.of(
                "id", e.getId().toString(),
                "title", e.getTitle(),
                "entry_type", e.getEntryType() != null ? e.getEntryType().name() : "FACT"
            ))
            .collect(Collectors.toList());

        return Map.of(
            "kbs", kbList,
            "recent_entries", entryList,
            "recent_topics", List.of(),
            "dismissed_topics", List.of()
        );
    }

    /** 调用 Python AI 服务生成推荐问题。 */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> callAiRecommendation(String userId, Map<String, Object> summary) {
        try {
            Map<String, Object> body = Map.of(
                "user_id", userId,
                "knowledge_summary", summary
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

            String url = aiBaseUrl + "/api/recommendations/daily";
            log.debug("[daily-rec] 调用 AI 服务 url={}", url);

            Map<String, Object> response = restTemplate.postForObject(url, request, Map.class);
            if (response == null) {
                log.warn("[daily-rec] AI 服务返回 null");
                return List.of();
            }

            List<Map<String, Object>> questions = (List<Map<String, Object>>) response.get("questions");
            return questions != null ? questions : List.of();
        } catch (Exception e) {
            log.error("[daily-rec] AI 服务调用失败", e);
            return List.of();
        }
    }

    private DailyRecommendation findOwnRecommendation(UUID id, UUID userId) {
        DailyRecommendation rec = recommendationRepository.findById(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "推荐不存在"));
        if (!rec.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权操作此推荐");
        }
        return rec;
    }

    private String toJson(Object obj) {
        try {
            return obj != null ? objectMapper.writeValueAsString(obj) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private UUID parseUUID(String s) {
        if (s == null || s.isBlank() || "null".equals(s)) return null;
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
