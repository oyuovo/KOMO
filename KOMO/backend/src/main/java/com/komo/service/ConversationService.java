package com.komo.service;

import com.komo.dto.DedupResult;
import com.komo.entity.Conversation;
import com.komo.entity.KnowledgeDraft;
import com.komo.entity.Message;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.ConversationRepository;
import com.komo.repository.MessageRepository;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
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

@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final KnowledgeDraftService knowledgeDraftService;
    private final KnowledgeIndexService knowledgeIndexService;

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

    /** 发送消息并获取 AI 回复 */
    @Transactional
    public Message sendMessage(UUID conversationId, UUID userId, String content) {
        Conversation convo = conversationRepository.findByIdAndUserId(conversationId, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));

        // 1. 保存用户消息
        Message userMsg = Message.builder()
            .conversationId(conversationId)
            .role(Message.MessageRole.USER)
            .content(content)
            .build();
        messageRepository.save(userMsg);

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
            aiResponse = "AI 服务暂时不可用: " + e.getMessage();
        }

        // 3. 保存 AI 回复
        Message assistantMsg = Message.builder()
            .conversationId(conversationId)
            .role(Message.MessageRole.ASSISTANT)
            .content(aiResponse)
            .build();
        messageRepository.save(assistantMsg);

        // 4. 自动更新对话标题（取用户第一条消息的前 30 字）
        if ((convo.getTitle() == null || convo.getTitle().equals("新对话")) && history.size() <= 2) {
            String newTitle = content.length() > 30 ? content.substring(0, 30) + "..." : content;
            convo.setTitle(newTitle);
            conversationRepository.save(convo);
        }

        // 5. 静默提取知识（不阻塞回复，失败不影响对话）
        try {
            extractAndSaveDrafts(userId, conversationId, assistantMsg.getId(), aiMessages);
        } catch (Exception e) {
            // 提取失败不抛出，仅记录日志
            System.err.println("[extraction] 知识提取失败: " + e.getMessage());
        }

        return assistantMsg;
    }

    /** SSE 流式对话 — 直接写 HttpServletResponse OutputStream */
    public void streamMessage(UUID conversationId, UUID userId, String content,
                               HttpServletResponse response) throws IOException {
        Conversation convo = conversationRepository.findByIdAndUserId(conversationId, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));

        // 1. 保存用户消息
        Message userMsg = Message.builder()
            .conversationId(conversationId)
            .role(Message.MessageRole.USER)
            .content(content)
            .build();
        messageRepository.save(userMsg);

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
                                out.flush();
                                n = -1; break;
                            }
                            if (!data.isEmpty()) {
                                fullResponse.append(data);
                                writeSseEvent(out, "token", data);
                            }
                        }
                    }
                }
                out.flush(); // 每个 chunk 后强制 flush
                if (n == -1) break;
            }
            bis.close();
            conn.disconnect();

            // 4. 保存 AI 回复
            Message assistantMsg = Message.builder()
                .conversationId(conversationId)
                .role(Message.MessageRole.ASSISTANT)
                .content(fullResponse.toString())
                .build();
            messageRepository.save(assistantMsg);

            // 标题
            if ((convo.getTitle() == null || convo.getTitle().equals("新对话")) && history.size() <= 2) {
                String t = content.length() > 30 ? content.substring(0, 30) + "..." : content;
                convo.setTitle(t);
                conversationRepository.save(convo);
            }

            // 知识提取
            try {
                extractAndSaveDrafts(userId, conversationId, assistantMsg.getId(), aiMessages);
            } catch (Exception ignored) {}

            // done 事件
            String doneData = om.writeValueAsString(Map.of("messageId", assistantMsg.getId().toString()));
            writeSseEvent(out, "done", doneData);
            out.flush();

        } catch (Exception e) {
            writeSseEvent(out, "error", "AI 服务暂时不可用: " + e.getMessage());
            out.flush();
        }
    }

    /** 写一条 SSE 事件到 OutputStream，正确处理 data 中的 \\n */
    private void writeSseEvent(OutputStream out, String eventName, String data) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("event:").append(eventName).append("\n");
        for (String line : data.split("\n", -1)) {
            sb.append("data:").append(line).append("\n");
        }
        sb.append("\n");
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** 调用 Python 提取知识，三层去重后保存为草稿 */
    private void extractAndSaveDrafts(
        UUID userId, UUID conversationId, UUID messageId,
        List<Map<String, String>> messages
    ) {
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

            DedupService dedupService = new DedupService(knowledgeIndexService, knowledgeDraftService);
            List<KnowledgeDraft> drafts = new ArrayList<>();
            for (Map<String, Object> point : points) {
                String title = (String) point.get("title");
                String content = (String) point.get("content");
                double confidence = point.get("confidence") instanceof Number
                    ? ((Number) point.get("confidence")).doubleValue() : 0.7;

                // Layer 1+2: ES MLT + 标题 LCS 去重（同时查知识库和草稿）
                DedupResult result = dedupService.checkDuplicate(userId, title,
                    content != null ? content : "");

                KnowledgeDraft draft = KnowledgeDraft.builder()
                    .title(title).content(content).confidence(confidence)
                    .build();

                if (dedupService.shouldAutoReject(result)) {
                    // 高分重复 -> 静默丢弃（不生成草稿）
                    continue;
                } else if (dedupService.needsLlmReview(result)) {
                    draft.setStatus(KnowledgeDraft.DraftStatus.PENDING_DEDUP);
                    draft.setRelationType(KnowledgeDraft.RelationType.SUPPLEMENTS);
                } else {
                    draft.setStatus(KnowledgeDraft.DraftStatus.PENDING);
                    draft.setRelationType(KnowledgeDraft.RelationType.NEW);
                }

                drafts.add(draft);
            }

            if (!drafts.isEmpty()) {
                knowledgeDraftService.saveExtractedDrafts(userId, conversationId, messageId, drafts);
            }
        } catch (Exception e) {
            System.err.println("[extraction] 草稿提取失败: " + e.getMessage());
        }
    }
}
