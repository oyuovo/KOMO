package com.komo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.komo.dto.ExtractionTaskPayload;
import com.komo.entity.Conversation;
import com.komo.entity.Message;
import com.komo.entity.User;
import com.komo.repository.ConversationRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.MessageRepository;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ConversationAutoExtractionTest {

    private static final String QUESTION = "解释一下乐观锁";
    private static final String ANSWER = "乐观锁通过版本号检测并发修改。\n冲突后应重新读取再重试。";

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void synchronousReplyIsIncludedInExtractionAlongsideHistory(boolean hasPriorExchange) {
        Fixture fixture = new Fixture(hasPriorExchange);

        Message saved = fixture.service.sendMessage(fixture.conversationId, fixture.userId, QUESTION);

        assertEquals(ANSWER, saved.getContent());
        fixture.assertEnqueuedReply();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @Timeout(10)
    void completeStreamedReplyIsExtractedEvenWhenClientDisconnects(boolean clientDisconnected) throws Exception {
        Fixture fixture = new Fixture(false);
        AtomicReference<String> upstreamRequest = new AtomicReference<>();
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/api/chat/stream", exchange -> {
            upstreamRequest.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] events = ("data: 乐观锁通过版本号\n\n"
                + "data: 检测并发修改。\n"
                + "data: 冲突后应重新读取再重试。\n\n"
                + "data: [DONE]\n\n").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=UTF-8");
            exchange.sendResponseHeaders(200, events.length);
            try (OutputStream body = exchange.getResponseBody()) {
                body.write(events);
            }
        });
        upstream.start();

        try {
            ReflectionTestUtils.setField(fixture.service, "aiBaseUrl",
                "http://127.0.0.1:" + upstream.getAddress().getPort());
            HttpServletResponse response;
            if (clientDisconnected) {
                ServletOutputStream disconnectedOutput = mock(ServletOutputStream.class);
                doThrow(new IOException("client disconnected")).when(disconnectedOutput).write(any(byte[].class));
                response = mock(HttpServletResponse.class);
                when(response.getOutputStream()).thenReturn(disconnectedOutput);
            } else {
                response = new MockHttpServletResponse();
            }

            fixture.service.streamMessage(fixture.conversationId, fixture.userId, QUESTION, response);

            verify(fixture.persistence).saveAssistantMessage(
                fixture.conversationId, fixture.userId, ANSWER, QUESTION, true);
            fixture.assertEnqueuedReply();
            assertEquals(new ObjectMapper().valueToTree(fixture.expectedHistory),
                new ObjectMapper().readTree(upstreamRequest.get()).get("messages"));
            if (response instanceof MockHttpServletResponse connectedResponse) {
                assertTrue(connectedResponse.getContentAsString().contains("event: done"));
            }
        } finally {
            upstream.stop(0);
        }
    }

    enum ExtractionDisabledBy { MANUAL_PREFERENCE, READING_CONVERSATION, NO_KNOWLEDGE_BASE }

    @Test
    @Timeout(10)
    void streamedMarkdownPreservesEmptyAndLeadingNewlineChunksInStorageAndEvents() throws Exception {
        Fixture fixture = new Fixture(false);
        List<String> chunks = List.of("## 三、分阶段学习路线", "\n\n", "### 阶段 0：基础准备（1-2 周）",
            "\n", "1. Python", "\n2. HTTP", "\n\n```python\n", "    print('你好')", "\n```\n");
        String expected = String.join("", chunks);
        StringBuilder wire = new StringBuilder();
        for (String chunk : chunks) {
            for (String line : chunk.split("\n", -1)) {
                wire.append("data: ").append(line).append("\n");
            }
            wire.append("\n");
        }
        wire.append("data: [DONE]\n\n");
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/api/chat/stream", exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] bytes = wire.toString().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream body = exchange.getResponseBody()) {
                body.write(bytes);
            }
        });
        upstream.start();
        try {
            ReflectionTestUtils.setField(fixture.service, "aiBaseUrl",
                "http://127.0.0.1:" + upstream.getAddress().getPort());
            MockHttpServletResponse response = new MockHttpServletResponse();
            fixture.service.streamMessage(fixture.conversationId, fixture.userId, QUESTION, response);
            verify(fixture.persistence).saveAssistantMessage(
                fixture.conversationId, fixture.userId, expected, QUESTION, true);
            fixture.assertEnqueuedReply(expected);
            StringBuilder clientText = new StringBuilder();
            for (String event : response.getContentAsString(StandardCharsets.UTF_8).split("\n\n")) {
                if (event.startsWith("event: token\n")) {
                    List<String> lines = new ArrayList<>();
                    for (String line : event.split("\n", -1)) {
                        if (line.startsWith("data: ")) lines.add(line.substring(6));
                    }
                    clientText.append(String.join("\n", lines));
                }
            }
            assertEquals(expected, clientText.toString());
        } finally {
            upstream.stop(0);
        }
    }

    @ParameterizedTest
    @EnumSource(ExtractionDisabledBy.class)
    void replyDoesNotEnqueueWhenAutomaticExtractionIsDisabled(ExtractionDisabledBy disabledBy) {
        Fixture fixture = new Fixture(false);
        switch (disabledBy) {
            case MANUAL_PREFERENCE -> fixture.user.setAutoExtract(false);
            case READING_CONVERSATION -> fixture.conversation.setType(Conversation.ConversationType.READING);
            case NO_KNOWLEDGE_BASE -> fixture.conversation.setKnowledgeBaseId(null);
        }

        fixture.service.sendMessage(fixture.conversationId, fixture.userId, QUESTION);

        verifyNoInteractions(fixture.rabbitTemplate);
    }

    private static class Fixture {
        final UUID userId = UUID.randomUUID();
        final UUID conversationId = UUID.randomUUID();
        final UUID messageId = UUID.randomUUID();
        final Conversation conversation = Conversation.builder()
            .userId(userId).knowledgeBaseId(UUID.randomUUID()).build();
        final User user = User.builder().autoExtract(true).build();
        final ConversationPersistenceService persistence = mock(ConversationPersistenceService.class);
        final RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        final ConversationService service;
        final List<Map<String, String>> expectedHistory;

        Fixture(boolean hasPriorExchange) {
            ConversationRepository conversations = mock(ConversationRepository.class);
            MessageRepository messages = mock(MessageRepository.class);
            UserService users = mock(UserService.class);
            RestTemplate restTemplate = mock(RestTemplate.class);
            when(conversations.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.of(conversation));
            when(users.findById(userId)).thenReturn(user);
            when(restTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenReturn(Map.of("content", ANSWER));

            List<Message> history = new ArrayList<>();
            if (hasPriorExchange) {
                history.add(Message.builder().role(Message.MessageRole.USER).content("什么是事务？").build());
                history.add(Message.builder().role(Message.MessageRole.ASSISTANT).content("事务是一组原子操作。").build());
            }
            history.add(Message.builder().role(Message.MessageRole.USER).content(QUESTION).build());
            when(messages.findAllByConversationIdOrderByCreatedAtAsc(conversationId)).thenReturn(history);
            expectedHistory = history.stream().map(message -> Map.of(
                "role", message.getRole() == Message.MessageRole.USER ? "user" : "assistant",
                "content", message.getContent())).toList();
            when(persistence.saveAssistantMessage(eq(conversationId), eq(userId), anyString(), eq(QUESTION), anyBoolean()))
                .thenAnswer(invocation -> {
                    Message saved = Message.builder().conversationId(conversationId)
                        .role(Message.MessageRole.ASSISTANT).content(invocation.getArgument(2)).build();
                    saved.setId(messageId);
                    return saved;
                });

            service = new ConversationService(conversations, messages, persistence,
                mock(KnowledgeDraftService.class), mock(KnowledgeIndexService.class),
                mock(KnowledgeBaseService.class), mock(KnowledgeRepository.class),
                mock(DedupService.class), rabbitTemplate, users, restTemplate);
            ReflectionTestUtils.setField(service, "aiBaseUrl", "http://127.0.0.1");
        }

        void assertEnqueuedReply() {
            assertEnqueuedReply(ANSWER);
        }

        void assertEnqueuedReply(String answer) {
            ArgumentCaptor<ExtractionTaskPayload> task = ArgumentCaptor.forClass(ExtractionTaskPayload.class);
            verify(rabbitTemplate).convertAndSend(eq("komo.extraction"), eq("extraction.task"), task.capture());
            assertEquals(userId, task.getValue().userId());
            assertEquals(conversationId, task.getValue().conversationId());
            assertEquals(messageId, task.getValue().messageId());
            List<Map<String, String>> expected = new ArrayList<>(expectedHistory);
            expected.add(Map.of("role", "assistant", "content", answer));
            assertEquals(expected, task.getValue().messages());
        }
    }
}
