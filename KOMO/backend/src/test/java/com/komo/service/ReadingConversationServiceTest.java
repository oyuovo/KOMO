package com.komo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.komo.entity.Conversation;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.Message;
import com.komo.exception.BusinessException;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.MessageRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpEntity;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReadingConversationServiceTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static class Fixture {
        final UUID userId = UUID.randomUUID();
        final UUID conversationId = UUID.randomUUID();
        final UUID articleId = UUID.randomUUID();
        final KnowledgeRepository knowledge = mock(KnowledgeRepository.class);
        final MessageRepository messages = mock(MessageRepository.class);
        final ConversationPersistenceService persistence = mock(ConversationPersistenceService.class);
        final RestTemplate http = mock(RestTemplate.class);
        final ReadingConversationService service = new ReadingConversationService(knowledge, messages, persistence, http);
        final Conversation conversation = Conversation.builder().userId(userId).articleId(articleId)
            .type(Conversation.ConversationType.READING).build();
        final KnowledgeEntry article = KnowledgeEntry.builder().userId(userId).title("测试文档")
            .content("🙂第一行\n第二行的前提与例外。\n").build();

        Fixture() {
            article.setId(articleId);
            conversation.setId(conversationId);
            when(knowledge.findByIdAndUserId(articleId, userId)).thenReturn(Optional.of(article));
            when(messages.findRecentByConversationIdAndUserId(eq(conversationId), eq(userId), any())).thenReturn(List.of());
            when(persistence.saveReadingAssistantMessage(eq(conversationId), eq(userId), anyString(), anyString(), anyBoolean(), anyString()))
                .thenAnswer(call -> {
                    Message saved = Message.builder().content(call.getArgument(2)).readingContext(call.getArgument(5)).build();
                    saved.setId(UUID.randomUUID());
                    return saved;
                });
            ReflectionTestUtils.setField(service, "aiBaseUrl", "http://ai.invalid");
            ReflectionTestUtils.setField(service, "internalToken", "test-only-internal-token-0123456789");
        }

        JsonNode context(String state) throws Exception {
            String content = article.getContent();
            return JSON.valueToTree(Map.of("document_id", articleId.toString(), "state", state,
                "document_hash", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8))),
                "sources", List.of(Map.of("id", "S1", "start_offset", 0,
                    "end_offset", content.codePointCount(0, content.length()), "text", content))));
        }
    }

    @Test
    void unauthorizedOrDeletedDocumentNeverReachesModelOrWritesMessages() {
        Fixture f = new Fixture();
        when(f.knowledge.findByIdAndUserId(f.articleId, f.userId)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> f.service.send(f.conversation, f.userId, "解释"));
        verifyNoInteractions(f.http, f.persistence);

        when(f.knowledge.findByIdAndUserId(f.articleId, f.userId)).thenReturn(Optional.of(f.article));
        f.article.setDeletedAt(LocalDateTime.now());
        assertThrows(BusinessException.class, () -> f.service.send(f.conversation, f.userId, "解释"));
        verifyNoInteractions(f.http, f.persistence);
    }

    @Test
    void foreignConversationIsRejectedBeforeArticleLookup() {
        Fixture f = new Fixture();
        assertThrows(BusinessException.class, () -> f.service.send(f.conversation, UUID.randomUUID(), "解释"));
        verifyNoInteractions(f.http, f.persistence);
        verify(f.knowledge, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void fullDocumentAndSelectionAreSentAndOriginalEvidenceIsPersisted() throws Exception {
        Fixture f = new Fixture();
        f.article.setContent("背景\n".repeat(5000) + "## 结论\n长文后部的真实依据🙂。\n");
        when(f.http.postForObject(anyString(), any(), eq(ReadingConversationService.ReadingReply.class)))
            .thenReturn(new ReadingConversationService.ReadingReply("解释[S1]", f.context("completed")));
        Message saved = f.service.send(f.conversation, f.userId, "> 长文后部的真实依据🙂。\n\n这是什么意思？");
        ArgumentCaptor<HttpEntity> request = ArgumentCaptor.forClass(HttpEntity.class);
        verify(f.http).postForObject(endsWith("/api/reading/sync"), request.capture(), eq(ReadingConversationService.ReadingReply.class));
        var body = (ReadingConversationService.ReadingRequest) request.getValue().getBody();
        assertEquals(f.userId.toString(), body.user_id());
        assertEquals("test-only-internal-token-0123456789", request.getValue().getHeaders().getFirst("X-Internal-Token"));
        assertEquals(f.article.getContent(), body.document().content());
        assertEquals("长文后部的真实依据🙂。", body.selection());
        assertEquals("completed", JSON.readTree(saved.getReadingContext()).path("state").asText());
        verify(f.knowledge, never()).save(any());
    }

    @Test
    void forgedSourceOrWrongDocumentHashIsRejected() throws Exception {
        Fixture f = new Fixture();
        var wrong = (com.fasterxml.jackson.databind.node.ObjectNode) f.context("completed");
        wrong.put("document_hash", "0".repeat(64));
        when(f.http.postForObject(anyString(), any(), eq(ReadingConversationService.ReadingReply.class)))
            .thenReturn(new ReadingConversationService.ReadingReply("answer", wrong));
        assertThrows(BusinessException.class, () -> f.service.send(f.conversation, f.userId, "解释"));
        var forged = f.context("completed");
        ((com.fasterxml.jackson.databind.node.ObjectNode) forged.path("sources").get(0)).put("text", "编造原文");
        when(f.http.postForObject(anyString(), any(), eq(ReadingConversationService.ReadingReply.class)))
            .thenReturn(new ReadingConversationService.ReadingReply("answer", forged));
        assertThrows(BusinessException.class, () -> f.service.send(f.conversation, f.userId, "解释"));
        verify(f.persistence, never()).saveReadingAssistantMessage(any(), any(), any(), any(), anyBoolean(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"complete", "error", "eof", "missing_context"})
    @Timeout(10)
    void streamingPersistsOnlyCompleteAnswersAndKeepsMetadataSeparate(String ending) throws Exception {
        Fixture f = new Fixture();
        String wire = "event: context\ndata: " + JSON.writeValueAsString(f.context("running")) + "\n\n"
            + "event: token\ndata: " + JSON.writeValueAsString("解释\n\n[S1]") + "\n\n";
        if (ending.equals("complete")) wire += "event: context\ndata: " + JSON.writeValueAsString(f.context("completed")) + "\n\n";
        if (ending.equals("error")) wire += "event: error\ndata: \"upstream failure\"\n\n";
        if (ending.equals("complete") || ending.equals("missing_context")) wire += "event: done\ndata: {}\n\n";
        byte[] bytes = wire.getBytes(StandardCharsets.UTF_8);
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/api/reading/stream", exchange -> {
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(200, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        upstream.start();
        try {
            ReflectionTestUtils.setField(f.service, "aiBaseUrl", "http://127.0.0.1:" + upstream.getAddress().getPort());
            MockHttpServletResponse response = new MockHttpServletResponse();
            response.setCharacterEncoding("UTF-8");
            f.service.stream(f.conversation, f.userId, "解释", response);
            String output = response.getContentAsString();
            assertTrue(output.contains("event: reading_context"));
            assertTrue(output.contains("event: token\ndata: 解释\ndata: \ndata: [S1]"));
            if (ending.equals("complete")) {
                verify(f.persistence).saveReadingAssistantMessage(eq(f.conversationId), eq(f.userId), eq("解释\n\n[S1]"), eq("解释"), eq(true), anyString());
                assertTrue(output.contains("event: done"));
                assertFalse(output.contains("event: error"));
            } else {
                verify(f.persistence, never()).saveReadingAssistantMessage(any(), any(), any(), any(), anyBoolean(), any());
                assertTrue(output.contains("event: error"));
                assertFalse(output.contains("event: done"));
            }
        } finally {
            upstream.stop(0);
        }
    }
}
