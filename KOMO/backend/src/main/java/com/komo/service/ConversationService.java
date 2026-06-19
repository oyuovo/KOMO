package com.komo.service;

import com.komo.dto.BatchDeleteResult;
import com.komo.dto.DedupResult;
import com.komo.dto.ExtractionTaskPayload;
import com.komo.entity.Conversation;
import com.komo.entity.KnowledgeDraft;
import com.komo.entity.Message;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.ConversationRepository;
import com.komo.repository.MessageRepository;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class ConversationService {

    private static final Logger log = LoggerFactory.getLogger(ConversationService.class);

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ConversationPersistenceService conversationPersistenceService;
    private final KnowledgeDraftService knowledgeDraftService;
    private final KnowledgeIndexService knowledgeIndexService;
    private final KnowledgeBaseService knowledgeBaseService;
    private final DedupService dedupService;
    private final RabbitTemplate rabbitTemplate;

    public ConversationService(ConversationRepository conversationRepository,
                               MessageRepository messageRepository,
                               ConversationPersistenceService conversationPersistenceService,
                               KnowledgeDraftService knowledgeDraftService,
                               KnowledgeIndexService knowledgeIndexService,
                               KnowledgeBaseService knowledgeBaseService,
                               DedupService dedupService,
                               RabbitTemplate rabbitTemplate) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.conversationPersistenceService = conversationPersistenceService;
        this.knowledgeDraftService = knowledgeDraftService;
        this.knowledgeIndexService = knowledgeIndexService;
        this.knowledgeBaseService = knowledgeBaseService;
        this.dedupService = dedupService;
        this.rabbitTemplate = rabbitTemplate;
    }

    /** 创建新对话 */
    @Transactional
    public Conversation create(UUID userId, String title) {
        Conversation convo = Conversation.builder()
            .userId(userId)
            .title(title != null ? title : "新对话")
            .build();
        return conversationRepository.save(convo);
    }

    /** 获取用户的对话列表 */
    public List<Conversation> list(UUID userId) {
        return conversationRepository.findAllByUserIdOrderByUpdatedAtDesc(userId);
    }

    /** 获取对话消息历史 */
    public List<Message> getMessages(UUID conversationId, UUID userId) {
        Conversation convo = conversationRepository.findByIdAndUserId(conversationId, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));
        return messageRepository.findAllByConversationIdOrderByCreatedAtAsc(conversationId);
    }

    /** 删除对话及其所有消息和关联草稿 */
    @Transactional
    public void delete(UUID conversationId, UUID userId) {
        Conversation convo = conversationRepository.findByIdAndUserId(conversationId, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));
        knowledgeDraftService.deleteByConversation(conversationId);
        messageRepository.deleteByConversationId(conversationId);
        conversationRepository.delete(convo);
    }

    /** 批量删除对话。逐条处理，单条失败不影响其他。 */
    @Transactional
    public BatchDeleteResult batchDelete(List<UUID> ids, UUID userId) {
        int deleted = 0;
        int failed = 0;
        for (UUID id : ids) {
            try {
                delete(id, userId);
                deleted++;
            } catch (Exception e) {
                failed++;
                log.warn("[batchDelete] 删除对话 {} 失败", id, e);
            }
        }
        return new BatchDeleteResult(deleted, failed, ids.size());
    }

    /** 发送消息并获取 AI 回复。事务拆分：保存用户消息(TX) → AI调用 → 保存助手消息(TX)。 */
    public Message sendMessage(UUID conversationId, UUID userId, String content) {
        // 1. 保存用户消息
        conversationPersistenceService.saveUserMessage(conversationId, userId, content);

        // 2. 构建消息历史
        List<Message> history = messageRepository.findAllByConversationIdOrderByCreatedAtAsc(conversationId);
        List<Map<String, String>> aiMessages = new ArrayList<>();

        // 2a. RAG 检索 — ES 全文搜索知识库
        List<Map<String, Object>> relevantEntries = knowledgeIndexService.search(userId, content, 3);
        if (!relevantEntries.isEmpty()) {
            StringBuilder context = new StringBuilder();
            context.append("以下是用户知识库中与当前问题相关的知识条目，请在回答时参考：\n\n");
            for (Map<String, Object> entry : relevantEntries) {
                context.append("### ").append(entry.getOrDefault("title", "")).append("\n");
                String snippet = (String) entry.getOrDefault("contentPlain", "");
                if (snippet != null && snippet.length() > 500) {
                    snippet = snippet.substring(0, 500) + "...";
                }
                context.append(snippet).append("\n\n");
            }
            context.append("---\n请基于以上知识库内容回答用户问题。如果知识库内容不足以回答，请如实告知并提供你自己的知识。");
            aiMessages.add(Map.of("role", "system", "content", context.toString()));
        }

        // 2b. 将历史消息加入上下文
        history.forEach(m -> aiMessages.add(Map.of(
            "role", m.getRole() == Message.MessageRole.USER ? "user" : "assistant",
            "content", m.getContent()
        )));

        // 3. 调用 Python AI 服务
        String aiResponse;
        try {
            ObjectMapper objectMapper = new ObjectMapper();
            Map<String, Object> requestBody = Map.of("messages", aiMessages);
            String jsonBody = objectMapper.writeValueAsString(requestBody);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(jsonBody, headers);

            RestTemplate restTemplate = new RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(
                "http://localhost:8001/api/chat/sync",
                entity,
                Map.class
            );

            aiResponse = response != null ? (String) response.get("content") : "AI 服务返回为空";
        } catch (Exception e) {
            log.error("AI 服务调用失败", e);
            aiResponse = "AI 服务暂时不可用，请稍后重试";
        }

        // 3. 保存 AI 回复
        Message assistantMsg = conversationPersistenceService.saveAssistantMessage(
            conversationId, userId, aiResponse, content, history.size() <= 2);

        // 5. 异步入队提取任务（RabbitMQ），不阻塞回复
        try {
            ExtractionTaskPayload payload = new ExtractionTaskPayload(
                userId, conversationId, assistantMsg.getId(), aiMessages);
            rabbitTemplate.convertAndSend("komo.extraction", "extraction.task", payload);
        } catch (Exception e) {
            log.warn("[extraction] 入队提取任务失败（RabbitMQ 可能未启动）", e);
        }

        return assistantMsg;
    }

    /** SSE 流式对话 — 直接写 HttpServletResponse OutputStream */
    public void streamMessage(UUID conversationId, UUID userId, String content,
                               HttpServletResponse response) throws IOException {
        // 1. 保存用户消息
        conversationPersistenceService.saveUserMessage(conversationId, userId, content);

        // 2. 构建消息历史 + RAG 上下文
        List<Message> history = messageRepository.findAllByConversationIdOrderByCreatedAtAsc(conversationId);
        List<Map<String, String>> aiMessages = new ArrayList<>();
        List<Map<String, Object>> relevant = knowledgeIndexService.search(userId, content, 3);
        if (!relevant.isEmpty()) {
            StringBuilder ctx = new StringBuilder("参考用户知识库：\n");
            for (Map<String, Object> e : relevant) {
                String s = (String) e.getOrDefault("contentPlain", "");
                if (s != null && s.length() > 300) s = s.substring(0, 300) + "...";
                ctx.append("- ").append(e.getOrDefault("title", "")).append(": ").append(s).append("\n");
            }
            aiMessages.add(Map.of("role", "system", "content", ctx.toString()));
        }
        history.forEach(m -> aiMessages.add(Map.of(
            "role", m.getRole() == Message.MessageRole.USER ? "user" : "assistant",
            "content", m.getContent())));

        // 3. 获取 OutputStream
        OutputStream out = response.getOutputStream();
        StringBuilder fullResponse = new StringBuilder();
        try {
            ObjectMapper om = new ObjectMapper();
            String jsonBody = om.writeValueAsString(Map.of("messages", aiMessages));

            HttpURLConnection conn = (HttpURLConnection) URI.create(
                "http://localhost:8001/api/chat/stream").toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(60000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            }

            java.io.BufferedInputStream bis = new java.io.BufferedInputStream(conn.getInputStream());
            java.io.ByteArrayOutputStream eventBuf = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = bis.read(buf)) != -1) {
                for (int i = 0; i < n; i++) {
                    eventBuf.write(buf[i]);
                    if (eventBuf.size() >= 2) {
                        byte[] raw = eventBuf.toByteArray();
                        int len = raw.length;
                        if (raw[len - 2] == '\n' && raw[len - 1] == '\n') {
                            String event = new String(raw, 0, len - 2, StandardCharsets.UTF_8);
                            eventBuf.reset();

                            if (event.isEmpty()) continue;
                            StringBuilder dataContent = new StringBuilder();
                            for (String line : event.split("\n")) {
                                if (line.startsWith("data: ")) {
                                    if (dataContent.length() > 0) dataContent.append("\n");
                                    dataContent.append(line.substring(6));
                                }
                            }
                            String data = dataContent.toString();

                            if ("[DONE]".equals(data)) { n = -1; break; }
                            if (data.startsWith("[ERROR]")) {
                                writeSseEvent(out, "error", data);
                                response.flushBuffer();
                                n = -1; break;
                            }
                            if (!data.isEmpty()) {
                                fullResponse.append(data);
                                writeSseEvent(out, "token", data);
                            }
                        }
                    }
                }
                response.flushBuffer(); // 每个 chunk 后强制 flush
                if (n == -1) break;
            }
            bis.close();
            conn.disconnect();

            // 4. 保存 AI 回复
            Message assistantMsg = conversationPersistenceService.saveAssistantMessage(
                conversationId, userId, fullResponse.toString(), content, history.size() <= 2);

            // 异步入队提取任务
            try {
                ExtractionTaskPayload payload = new ExtractionTaskPayload(
                    userId, conversationId, assistantMsg.getId(), aiMessages);
                rabbitTemplate.convertAndSend("komo.extraction", "extraction.task", payload);
            } catch (Exception e) {
                log.warn("[extraction] SSE流中入队提取任务失败（RabbitMQ 可能未启动）", e);
            }

            // done 事件
            String doneData = om.writeValueAsString(Map.of("messageId", assistantMsg.getId().toString()));
            writeSseEvent(out, "done", doneData);
            response.flushBuffer();

        } catch (Exception e) {
            try {
                writeSseEvent(out, "error", "AI 服务暂时不可用，请稍后重试");
                response.flushBuffer();
            } catch (Exception writeErr) {
                log.debug("SSE error事件写入失败（客户端可能已断开）", writeErr);
            }
        }
    }

    /** 写一条 SSE 事件到 OutputStream，正确处理 data 中的 \\n */
    private void writeSseEvent(OutputStream out, String eventName, String data) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("event: ").append(eventName).append("\n");
        for (String line : data.split("\n", -1)) {
            sb.append("data: ").append(line).append("\n");
        }
        sb.append("\n");
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** 调用 Python 提取知识，按类型路由后保存为草稿。public 供 ExtractionWorker 调用。 */
    public void extractAndSaveDrafts(
        UUID userId, UUID conversationId, UUID messageId,
        List<Map<String, String>> messages
    ) {
        if (knowledgeDraftService.hasDraftsForMessage(messageId, userId)) {
            log.info("[extraction] 跳过重复投递 userId={} messageId={}", userId, messageId);
            return;
        }

        try {
            ObjectMapper objectMapper = new ObjectMapper();
            Map<String, Object> extractReq = Map.of("messages", messages);
            String jsonBody = objectMapper.writeValueAsString(extractReq);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(jsonBody, headers);

            RestTemplate restTemplate = new RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(
                "http://localhost:8001/api/extraction/extract",
                entity,
                Map.class
            );

            if (response == null || !response.containsKey("knowledge_points")) {
                return;
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> points =
                (List<Map<String, Object>>) response.get("knowledge_points");

            List<KnowledgeDraft> drafts = new ArrayList<>();
            for (Map<String, Object> point : points) {
                String title = (String) point.get("title");
                String content = (String) point.get("content");
                double confidence = point.get("confidence") instanceof Number
                    ? ((Number) point.get("confidence")).doubleValue() : 0.7;
                String typeStr = (String) point.getOrDefault("type", "FRAGMENT");

                // 解析提取类型
                KnowledgeDraft.ExtractType extractType;
                try {
                    extractType = KnowledgeDraft.ExtractType.valueOf(typeStr);
                } catch (IllegalArgumentException e) {
                    log.warn("[extraction] 未知提取类型 {}，降级为 FRAGMENT", typeStr, e);
                    extractType = KnowledgeDraft.ExtractType.FRAGMENT;
                }

                // 防御性校验：ARTICLE 纯文本 < 500 字 → 降级为 FRAGMENT
                if (extractType == KnowledgeDraft.ExtractType.ARTICLE) {
                    int plainLen = plainTextLength(content);
                    if (plainLen < 500) {
                        log.warn("[extraction] ARTICLE 内容过短({}字)，降级为 FRAGMENT: {}",
                            plainLen, title);
                        extractType = KnowledgeDraft.ExtractType.FRAGMENT;
                    }
                }

                // Layer 1+2: ES MLT + 标题 LCS 去重
                DedupResult result = dedupService.checkDuplicate(userId, title,
                    content != null ? content : "");

                KnowledgeDraft draft = KnowledgeDraft.builder()
                    .title(title).content(content).confidence(confidence)
                    .extractType(extractType)
                    .build();

                // 根据提取类型 + 去重结果决定处理方式
                if (dedupService.shouldAutoReject(result)) {
                    continue; // 高分重复，静默丢弃
                }

                if (extractType == KnowledgeDraft.ExtractType.SUPPLEMENT) {
                    // SUPPLEMENT：尝试匹配父文章
                    if (result.isDuplicate() && result.getMatchedEntryId() != null) {
                        draft.setRelationType(KnowledgeDraft.RelationType.SUPPLEMENTS);
                        draft.setRelationDetail("{\"parentEntryId\":\"" + result.getMatchedEntryId() + "\"}");
                    }
                    draft.setStatus(KnowledgeDraft.DraftStatus.PENDING);
                } else if (extractType == KnowledgeDraft.ExtractType.ARTICLE) {
                    // ARTICLE：高质量新知。模糊区间 → LLM 语义去重当场判定
                    if (dedupService.needsLlmReview(result)) {
                        Map<String, Object> verdict = resolveByLlmDedup(userId, title, content);
                        String llmVerdict = (String) verdict.getOrDefault("verdict", "NEW");
                        double llmConfidence = verdict.get("confidence") instanceof Number
                            ? ((Number) verdict.get("confidence")).doubleValue() : 0.5;

                        if ("DUPLICATE".equals(llmVerdict)) {
                            log.info("[extraction] LLM判定重复 confidence={}，丢弃: {}", llmConfidence, title);
                            continue;
                        } else if ("SUPPLEMENTS".equals(llmVerdict)) {
                            draft.setStatus(KnowledgeDraft.DraftStatus.PENDING);
                            draft.setRelationType(KnowledgeDraft.RelationType.SUPPLEMENTS);
                            if (result.getMatchedEntryId() != null) {
                                draft.setRelationDetail("{\"parentEntryId\":\""
                                    + result.getMatchedEntryId() + "\"}");
                            }
                        } else {
                            // NEW 或 CONTRADICTS → 按新知处理
                            draft.setStatus(KnowledgeDraft.DraftStatus.PENDING);
                            draft.setRelationType(KnowledgeDraft.RelationType.NEW);
                        }
                    } else if (dedupService.shouldAutoReject(result)) {
                        continue; // 高分重复，静默丢弃
                    } else {
                        draft.setStatus(KnowledgeDraft.DraftStatus.PENDING);
                        draft.setRelationType(KnowledgeDraft.RelationType.NEW);
                    }
                } else {
                    // FRAGMENT：碎片知识。如果有强匹配文章 → 默认嵌入；否则 → 碎片库兜底
                    double matchScore = result.getScore();
                    if (result.isDuplicate() && result.getMatchedEntryId() != null && matchScore > 0.4) {
                        // 强匹配已有文章 → 默认嵌入
                        draft.setRelationType(KnowledgeDraft.RelationType.SUPPLEMENTS);
                        draft.setRelationDetail("{\"parentEntryId\":\"" + result.getMatchedEntryId()
                            + "\",\"score\":" + String.format("%.2f", matchScore) + "}");
                    } else {
                        draft.setRelationType(KnowledgeDraft.RelationType.NEW);
                    }
                    draft.setStatus(KnowledgeDraft.DraftStatus.PENDING);
                }

                drafts.add(draft);
            }

            if (!drafts.isEmpty()) {
                knowledgeDraftService.saveExtractedDrafts(userId, conversationId, messageId, drafts);
            }
        } catch (Exception e) {
            log.error("[extraction] 草稿提取失败，将由消息队列重试", e);
            throw new IllegalStateException("Knowledge extraction failed", e);
        }
    }

    /** 去除 Markdown 标记，返回纯文本字符数。用于 ARTICLE 长度门槛校验。 */
    private int plainTextLength(String markdown) {
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

    /**
     * Layer 3: 调用 Python DeepSeek LLM 进行语义去重判定。
     * 仅在 MLT/LCS 得分处于模糊区间（0.2~0.6）时调用。
     *
     * @return verdict map: {verdict: DUPLICATE|SUPPLEMENTS|CONTRADICTS|NEW, confidence, matched_index}
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> resolveByLlmDedup(UUID userId, String title, String content) {
        try {
            // 获取 ES 中相似条目作为 LLM 判断上下文
            List<Map<String, Object>> similar = knowledgeIndexService.findSimilar(userId, title, content, 5);
            List<Map<String, Object>> existing = new ArrayList<>();
            for (Map<String, Object> s : similar) {
                existing.add(Map.of(
                    "id", s.getOrDefault("_id", ""),
                    "title", s.getOrDefault("title", ""),
                    "content_plain", s.getOrDefault("contentPlain", "")
                ));
            }

            Map<String, Object> dedupReq = Map.of(
                "candidate_title", title != null ? title : "",
                "candidate_content", content != null ? content : "",
                "existing_knowledge", existing
            );

            ObjectMapper om = new ObjectMapper();
            String jsonBody = om.writeValueAsString(dedupReq);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(jsonBody, headers);

            RestTemplate rt = new RestTemplate();
            Map<String, Object> response = rt.postForObject(
                "http://localhost:8001/api/dedup/check",
                entity,
                Map.class
            );

            if (response != null) {
                log.debug("[dedup] LLM判定: verdict={} confidence={}",
                    response.get("verdict"), response.get("confidence"));
                return response;
            }
        } catch (Exception e) {
            log.warn("[dedup] LLM去重调用失败，按新知处理: {}", title, e);
        }
        // 兜底：按新知处理
        return Map.of("verdict", "NEW", "confidence", 0.5, "matched_index", -1);
    }
}
