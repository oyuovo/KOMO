package com.komo.service;

import com.komo.repository.ConversationRepository;
import com.komo.repository.MessageRepository;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

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
            mock(KnowledgeIndexService.class),
            mock(KnowledgeBaseService.class),
            mock(DedupService.class),
            mock(RabbitTemplate.class),
            mock(UserService.class),
            restTemplate
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
}
