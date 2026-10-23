package com.komo.service;

import com.komo.entity.Conversation;
import com.komo.entity.Conversation.ConversationType;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.repository.ConversationRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.MessageRepository;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ConversationServiceTest {

    private ConversationService newService(RestTemplate restTemplate, KnowledgeDraftService draftService) {
        return new ConversationService(
            mock(ConversationRepository.class),
            mock(MessageRepository.class),
            mock(ConversationPersistenceService.class),
            draftService,
            mock(KnowledgeRetrievalService.class),
            mock(KnowledgeBaseService.class),
            mock(KnowledgeRepository.class),
            mock(DedupService.class),
            mock(RabbitTemplate.class),
            mock(UserService.class),
            restTemplate, mock(ReadingConversationService.class)
        );
    }

    /** 构造带 mock 仓库的 service，用于 READING 分支测试 */
    private ConversationService newService(
        ConversationRepository conversationRepository, KnowledgeRepository knowledgeRepository
    ) {
        return new ConversationService(
            conversationRepository,
            mock(MessageRepository.class),
            mock(ConversationPersistenceService.class),
            mock(KnowledgeDraftService.class),
            mock(KnowledgeRetrievalService.class),
            mock(KnowledgeBaseService.class),
            knowledgeRepository,
            mock(DedupService.class),
            mock(RabbitTemplate.class),
            mock(UserService.class),
            mock(RestTemplate.class), mock(ReadingConversationService.class)
        );
    }

    @Test
    void extractionFailurePropagatesSoRabbitListenerCanRetry() {
        RestTemplate restTemplate = mock(RestTemplate.class);
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class)))
            .thenThrow(new RestClientException("AI service unavailable"));

        ConversationService service = newService(restTemplate, mock(KnowledgeDraftService.class));

        assertThrows(IllegalStateException.class, () -> service.extractAndSaveDrafts(
            UUID.randomUUID(),
            UUID.randomUUID(),
            UUID.randomUUID(),
            List.of(Map.of("role", "user", "content", "test"))
        ));
    }

    @Test
    void redeliveredTaskSkipsExtractionWhenMessageAlreadyHasDrafts() {
        UUID userId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        KnowledgeDraftService draftService = mock(KnowledgeDraftService.class);
        when(draftService.hasDraftsForMessage(messageId, userId)).thenReturn(true);

        RestTemplate restTemplate = mock(RestTemplate.class);
        ConversationService service = newService(restTemplate, draftService);

        service.extractAndSaveDrafts(
            userId,
            UUID.randomUUID(),
            messageId,
            List.of(Map.of("role", "user", "content", "test"))
        );

        // 已有草稿时应直接跳过，不再调用 AI 提取服务
        verifyNoInteractions(restTemplate);
    }

    @Test
    void readingConversationIsReusedPerArticle() {
        UUID userId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();
        UUID kbId = UUID.randomUUID();

        KnowledgeEntry article = KnowledgeEntry.builder()
            .userId(userId)
            .title("测试文章")
            .knowledgeBaseId(kbId)
            .content("正文")
            .build();
        // BaseEntity id 由 JPA 生成，此处仅验证复用逻辑，无需设置

        ConversationRepository conversationRepository = mock(ConversationRepository.class);
        KnowledgeRepository knowledgeRepository = mock(KnowledgeRepository.class);
        when(knowledgeRepository.findByIdAndUserId(articleId, userId)).thenReturn(Optional.of(article));

        Conversation existing = Conversation.builder()
            .userId(userId)
            .title("测试文章")
            .knowledgeBaseId(kbId)
            .type(ConversationType.READING)
            .articleId(articleId)
            .build();
        when(conversationRepository.findFirstByUserIdAndArticleIdAndTypeOrderByUpdatedAtDesc(
            userId, articleId, ConversationType.READING)).thenReturn(Optional.of(existing));

        ConversationService service = newService(conversationRepository, knowledgeRepository);

        Conversation result = service.getOrCreateReadingConversation(userId, articleId);
        assertEquals(existing, result);
    }

    @Test
    void readingConversationIsCreatedWhenMissing() {
        UUID userId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();
        UUID kbId = UUID.randomUUID();

        KnowledgeEntry article = KnowledgeEntry.builder()
            .userId(userId)
            .title("测试文章")
            .knowledgeBaseId(kbId)
            .content("正文")
            .build();
        // 无 deletedAt → 未软删
        assertNull(article.getDeletedAt());

        ConversationRepository conversationRepository = mock(ConversationRepository.class);
        KnowledgeRepository knowledgeRepository = mock(KnowledgeRepository.class);
        when(knowledgeRepository.findByIdAndUserId(articleId, userId)).thenReturn(Optional.of(article));
        when(conversationRepository.findFirstByUserIdAndArticleIdAndTypeOrderByUpdatedAtDesc(
            userId, articleId, ConversationType.READING)).thenReturn(Optional.empty());
        when(conversationRepository.save(any(Conversation.class))).thenAnswer(inv -> inv.getArgument(0));

        ConversationService service = newService(conversationRepository, knowledgeRepository);

        Conversation result = service.getOrCreateReadingConversation(userId, articleId);
        assertNotNull(result);
        assertEquals(ConversationType.READING, result.getType());
        assertEquals(articleId, result.getArticleId());
        assertEquals(kbId, result.getKnowledgeBaseId());
        assertEquals("测试文章", result.getTitle());
    }

    @Test
    void readingConversationRejectsMissingArticle() {
        UUID userId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();

        KnowledgeRepository knowledgeRepository = mock(KnowledgeRepository.class);
        when(knowledgeRepository.findByIdAndUserId(articleId, userId)).thenReturn(Optional.empty());

        ConversationService service = newService(mock(ConversationRepository.class), knowledgeRepository);

        BusinessException ex = assertThrows(BusinessException.class,
            () -> service.getOrCreateReadingConversation(userId, articleId));
        assertNotNull(ex);
    }

    @Test
    void readingConversationRejectsSoftDeletedArticle() {
        UUID userId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();

        KnowledgeEntry article = KnowledgeEntry.builder()
            .userId(userId)
            .title("已删除文章")
            .deletedAt(LocalDateTime.now())
            .build();

        KnowledgeRepository knowledgeRepository = mock(KnowledgeRepository.class);
        when(knowledgeRepository.findByIdAndUserId(articleId, userId)).thenReturn(Optional.of(article));

        ConversationService service = newService(mock(ConversationRepository.class), knowledgeRepository);

        assertThrows(BusinessException.class,
            () -> service.getOrCreateReadingConversation(userId, articleId));
    }

    @Test
    void readingConversationSkipsExtractionEnqueue() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();

        Conversation reading = Conversation.builder()
            .userId(userId)
            .title("阅读问答")
            .type(ConversationType.READING)
            .articleId(UUID.randomUUID())
            .knowledgeBaseId(UUID.randomUUID())
            .build();

        ConversationRepository conversationRepository = mock(ConversationRepository.class);
        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.of(reading));

        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        UserService userService = mock(UserService.class);
        ConversationService service = new ConversationService(
            conversationRepository,
            mock(MessageRepository.class),
            mock(ConversationPersistenceService.class),
            mock(KnowledgeDraftService.class),
            mock(KnowledgeRetrievalService.class),
            mock(KnowledgeBaseService.class),
            mock(KnowledgeRepository.class),
            mock(DedupService.class),
            rabbitTemplate,
            userService,
            mock(RestTemplate.class), mock(ReadingConversationService.class)
        );

        // triggerExtraction 对 READING 对话直接拒绝
        assertThrows(BusinessException.class,
            () -> service.triggerExtraction(conversationId, userId));
        verifyNoInteractions(rabbitTemplate);
    }
}
