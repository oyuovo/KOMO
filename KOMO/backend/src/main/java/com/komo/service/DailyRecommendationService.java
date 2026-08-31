package com.komo.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.komo.entity.Conversation;
import com.komo.entity.DailyRecommendation;
import com.komo.entity.KnowledgeBase;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.User;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.ConversationRepository;
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
import org.springframework.transaction.support.TransactionTemplate;
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
    private final ConversationRepository conversationRepository;
    private final TransactionTemplate transactionTemplate;
    private final RestTemplate restTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 用户级锁：防止同一用户并发触发 generate 时双写 ACTIVE 记录。 */
    private final java.util.concurrent.ConcurrentHashMap<UUID, Object> userLocks = new java.util.concurrent.ConcurrentHashMap<>();

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

        // 查找今天已有的活跃推荐（容错同日重复，取最新一条）
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        return recommendationRepository
            .findTopByUserIdAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(userId, "ACTIVE", todayStart)
            .orElse(null);
    }

    /**
     * 触发生成推荐问题（调用 AI 服务 + 入库）。
     *
     * @param force false=幂等：今日已有 ACTIVE 推荐则直接返回；
     *              true=强制重新生成（先把旧推荐标记为 DISMISSED）。
     *
     * 事务拆分（硬性约束：外部 API 调用不能在 @Transactional 内）：
     * TX1 处理旧推荐 → 外部调用 AI → TX2 保存新推荐。
     */
    public DailyRecommendation generateTodayRecommendation(UUID userId, boolean force) {
        // 用户级互斥：前端可能并发发起两次生成（如 StrictMode 双挂载），
        // 不加锁会产生同日双 ACTIVE 记录。
        synchronized (userLocks.computeIfAbsent(userId, k -> new Object())) {
            return doGenerateTodayRecommendation(userId, force);
        }
    }

    private DailyRecommendation doGenerateTodayRecommendation(UUID userId, boolean force) {
        User user = userService.findById(userId);
        if (Boolean.FALSE.equals(user.getDailyRecommendationEnabled())) {
            return null;
        }

        // 幂等检查：非强制模式下，今日已有推荐则直接返回，不重复调 AI。
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        DailyRecommendation existing = recommendationRepository
            .findTopByUserIdAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(userId, "ACTIVE", todayStart)
            .orElse(null);
        if (existing != null && !force) {
            return existing;
        }

        // TX1: 将旧的活跃推荐标记为已处理（短事务）
        transactionTemplate.executeWithoutResult(status -> {
            List<DailyRecommendation> oldActive = recommendationRepository
                .findByUserIdAndStatus(userId, "ACTIVE");
            for (DailyRecommendation old : oldActive) {
                old.setStatus("DISMISSED");
                recommendationRepository.save(old);
            }
        });

        // 构建知识概况（含近期话题与已忽略话题）
        Map<String, Object> summary = buildKnowledgeSummary(userId);

        // 外部调用 Python AI 服务（无事务）
        List<Map<String, Object>> questions = callAiRecommendation(userId.toString(), summary);

        if (questions.isEmpty()) {
            log.info("[daily-rec] user={} AI 未生成任何问题（知识不足或无合适话题）", userId);
            return null;
        }

        // 取第一个问题，在新事务中入库（AI 调用已完成）
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

        DailyRecommendation saved = transactionTemplate.execute(status -> recommendationRepository.save(rec));
        log.info("[daily-rec] user={} 新推荐已入库 id={} dimension={}", userId,
            saved != null ? saved.getId() : null, rec.getDimension());
        return saved;
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

        // 最近 5 个对话主题（对话标题），供 AI 参考近期讨论方向，避免重复提问。
        List<String> recentTopics = conversationRepository
            .findAllByUserIdOrderByUpdatedAtDesc(userId, PageRequest.of(0, 5))
            .stream()
            .map(Conversation::getTitle)
            .filter(t -> t != null && !t.isBlank() && !"新对话".equals(t))
            .collect(Collectors.toList());

        // 最近 10 条已忽略推荐的问题，避免重复推荐用户不感兴趣的话题。
        List<String> dismissedTopics = recommendationRepository
            .findByUserIdAndStatusOrderByCreatedAtDesc(userId, "DISMISSED")
            .stream()
            .limit(10)
            .map(DailyRecommendation::getQuestion)
            .filter(q -> q != null && !q.isBlank())
            .collect(Collectors.toList());

        return Map.of(
            "kbs", kbList,
            "recent_entries", entryList,
            "recent_topics", recentTopics,
            "dismissed_topics", dismissedTopics
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
        return recommendationRepository.findByIdAndUserId(id, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "推荐不存在"));
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
