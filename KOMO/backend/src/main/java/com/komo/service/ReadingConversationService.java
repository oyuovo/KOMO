package com.komo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.komo.entity.Conversation;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.Message;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.MessageRepository;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Java owns authorization and persistence; Python owns the reading policy. */
@Service
public class ReadingConversationService {
    private static final Logger log = LoggerFactory.getLogger(ReadingConversationService.class);
    private final KnowledgeRepository knowledge;
    private final MessageRepository messages;
    private final ConversationPersistenceService persistence;
    private final RestTemplate http;
    private final ObjectMapper json = new ObjectMapper();

    @Value("${komo.ai.base-url}")
    private String aiBaseUrl;

    public ReadingConversationService(KnowledgeRepository knowledge, MessageRepository messages,
                                      ConversationPersistenceService persistence, RestTemplate http) {
        this.knowledge = knowledge;
        this.messages = messages;
        this.persistence = persistence;
        this.http = http;
    }

    record Document(@NotBlank String id, @NotBlank @Size(max = 500) String title,
                    @NotBlank @Size(max = 2_000_000) String content) {}
    record Turn(@NotBlank String role, @NotNull @Size(max = 24000) String content) {}
    @Value("${komo.ai.internal-token:}")
    private String internalToken;

    record ReadingRequest(@NotBlank String user_id, @NotNull @Valid Document document,
                          @NotBlank @Size(max = 20000) String question,
                          @NotNull @Size(max = 20000) String selection,
                          @NotNull @Size(max = 20) List<Turn> history) {}
    record ReadingReply(String content, JsonNode readingContext) {}

    private ReadingRequest prepare(Conversation conversation, UUID userId, String content) {
        if (!userId.equals(conversation.getUserId()) || conversation.getArticleId() == null) {
            throw new BusinessException(ErrorCode.KNOWLEDGE_NOT_FOUND, "文章不存在或无权访问");
        }
        KnowledgeEntry article = knowledge.findByIdAndUserId(conversation.getArticleId(), userId)
            .filter(entry -> entry.getDeletedAt() == null)
            .orElseThrow(() -> new BusinessException(ErrorCode.KNOWLEDGE_NOT_FOUND, "文章不存在或无权访问"));
        if (article.getContent() == null || article.getContent().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "文章尚无正文，请先编辑文档");
        }
        List<Message> history = new ArrayList<>(messages.findRecentByConversationIdAndUserId(
            conversation.getId(), userId, PageRequest.of(0, 20)));
        Collections.reverse(history);
        // Quote is optional context, never an identity or authorization parameter.
        StringBuilder selection = new StringBuilder();
        for (String line : content.split("\n")) {
            if (line.startsWith("> ")) {
                if (!selection.isEmpty()) selection.append('\n');
                selection.append(line.substring(2));
            } else if (!line.isBlank() || !selection.isEmpty()) {
                break;
            }
        }
        return new ReadingRequest(userId.toString(), new Document(article.getId().toString(), article.getTitle(), article.getContent()),
            content, selection.toString(), history.stream()
                .filter(m -> m.getContent() != null && m.getContent().length() <= 24000)
                .map(m -> new Turn(m.getRole() == Message.MessageRole.USER ? "user" : "assistant", m.getContent()))
                .toList());
    }

    public Message send(Conversation conversation, UUID userId, String content) {
        ReadingRequest request = prepare(conversation, userId, content);
        persistence.saveUserMessage(conversation.getId(), userId, content);
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Token", internalToken);
            ReadingReply reply = http.postForObject(aiBaseUrl + "/api/reading/sync",
                new HttpEntity<>(request, headers), ReadingReply.class);
            if (reply == null || reply.content() == null || reply.content().isBlank() || reply.content().length() > 24000) {
                throw new IllegalStateException("Invalid reading reply");
            }
            validateContext(reply.readingContext(), request.document(), true);
            return persistence.saveReadingAssistantMessage(conversation.getId(), userId, reply.content(),
                content, request.history().isEmpty(), json.writeValueAsString(reply.readingContext()));
        } catch (Exception e) {
            log.error("Reading request failed conversationId={}", conversation.getId(), e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "阅读回答未完成，请稍后重试");
        }
    }

    public void stream(Conversation conversation, UUID userId, String content, HttpServletResponse response) throws IOException {
        ReadingRequest request = prepare(conversation, userId, content);
        persistence.saveUserMessage(conversation.getId(), userId, content);
        OutputStream out = response.getOutputStream();
        HttpURLConnection connection = null;
        StringBuilder answer = new StringBuilder();
        JsonNode context = null;
        boolean done = false;
        try {
            connection = (HttpURLConnection) URI.create(aiBaseUrl + "/api/reading/stream").toURL().openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(100000);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("X-Internal-Token", internalToken);
            try (OutputStream body = connection.getOutputStream()) {
                json.writeValue(body, request);
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String type = "";
                StringBuilder data = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.length() > 100000 || data.length() > 100000) throw new IOException("Reading event too large");
                    if (line.startsWith("event:")) type = line.substring(6).trim();
                    else if (line.startsWith("data:")) {
                        if (!data.isEmpty()) data.append('\n');
                        data.append(line.substring(5).stripLeading());
                    } else if (line.isEmpty() && !data.isEmpty()) {
                        JsonNode value = json.readTree(data.toString());
                        if ("error".equals(type)) throw new IOException("Reading provider reported failure");
                        if ("context".equals(type)) {
                            validateContext(value, request.document(), false);
                            context = value;
                            out = emit(out, response, "reading_context", json.writeValueAsString(value));
                        } else if ("token".equals(type)) {
                            if (!value.isTextual() || answer.length() + value.asText().length() > 24000) {
                                throw new IOException("Invalid reading token");
                            }
                            answer.append(value.asText());
                            out = emit(out, response, "token", value.asText());
                        } else if ("done".equals(type)) {
                            done = true;
                            break;
                        }
                        data.setLength(0);
                        type = "";
                    }
                }
            }
            if (!done || answer.toString().isBlank()) throw new IOException("Incomplete reading stream");
            validateContext(context, request.document(), true);
            Message saved = persistence.saveReadingAssistantMessage(conversation.getId(), userId, answer.toString(),
                content, request.history().isEmpty(), json.writeValueAsString(context));
            emit(out, response, "done", json.writeValueAsString(Map.of("messageId", saved.getId().toString())));
        } catch (Exception e) {
            log.error("Reading stream failed conversationId={}", conversation.getId(), e);
            // Partial model output is never persisted or reported as a completed answer.
            emit(out, response, "error", "阅读回答未完成，请稍后重试。已显示的部分内容尚未保存。");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private OutputStream emit(OutputStream out, HttpServletResponse response, String type, String data) {
        try {
            StringBuilder event = new StringBuilder("event: ").append(type).append('\n');
            for (String line : data.split("\n", -1)) event.append("data: ").append(line).append('\n');
            out.write(event.append('\n').toString().getBytes(StandardCharsets.UTF_8));
            response.flushBuffer();
            return out;
        } catch (IOException e) {
            log.debug("Reading client disconnected; finishing the bounded request", e);
            return OutputStream.nullOutputStream();
        }
    }

    private void validateContext(JsonNode context, Document document, boolean completed) throws IOException {
        if (context == null || !document.id().equals(context.path("document_id").asText())
            || !hash(document.content()).equals(context.path("document_hash").asText())
            || !context.path("sources").isArray() || context.path("sources").size() > 24
            || context.toString().length() > 64000
            || (completed && !"completed".equals(context.path("state").asText()))) {
            throw new IOException("Invalid reading context");
        }
        int count = document.content().codePointCount(0, document.content().length());
        for (JsonNode source : context.path("sources")) {
            int start = source.path("start_offset").asInt(-1);
            int end = source.path("end_offset").asInt(-1);
            if (start < 0 || end <= start || end > count) throw new IOException("Invalid evidence range");
            String original = document.content().substring(document.content().offsetByCodePoints(0, start),
                document.content().offsetByCodePoints(0, end));
            if (!original.equals(source.path("text").asText())) throw new IOException("Evidence differs from source");
        }
    }

    private String hash(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
