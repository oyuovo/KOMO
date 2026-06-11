package com.komo.service;

import com.komo.entity.Conversation;
import com.komo.entity.KnowledgeDraft;
import com.komo.entity.Message;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.entity.KnowledgeEntry;
import com.komo.repository.ConversationRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;

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
    private final KnowledgeRepository knowledgeRepository;

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

    /** 删除对话及其所有消息 */
    @Transactional
    public void delete(UUID conversationId, UUID userId) {
        Conversation convo = conversationRepository.findByIdAndUserId(conversationId, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));
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

        // 2a. RAG 检索 — 从知识库搜索相关内容作为 AI 上下文
        List<KnowledgeEntry> relevantEntries = knowledgeRepository.findByUserIdAndFilters(
            userId, null, content, PageRequest.of(0, 3)
        ).getContent();

        if (!relevantEntries.isEmpty()) {
            StringBuilder context = new StringBuilder();
            context.append("以下是用户知识库中与当前问题相关的知识条目，请在回答时参考：\n\n");
            for (KnowledgeEntry entry : relevantEntries) {
                context.append("### ").append(entry.getTitle()).append("\n");
                String snippet = entry.getContentPlain() != null
                    ? entry.getContentPlain()
                    : entry.getContent();
                if (snippet.length() > 500) {
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

    /** 调用 Python 提取知识，保存为草稿 */
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

            List<KnowledgeDraft> drafts = new ArrayList<>();
            for (Map<String, Object> point : points) {
                KnowledgeDraft draft = KnowledgeDraft.builder()
                    .title((String) point.get("title"))
                    .content((String) point.get("content"))
                    .confidence(point.get("confidence") instanceof Number
                        ? ((Number) point.get("confidence")).doubleValue() : 0.7)
                    .build();
                drafts.add(draft);
            }

            if (!drafts.isEmpty()) {
                knowledgeDraftService.saveExtractedDrafts(userId, conversationId, messageId, drafts);
            }
        } catch (Exception e) {
            System.err.println("[extraction] 知识提取调用失败: " + e.getMessage());
        }
    }
}
