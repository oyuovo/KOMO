package com.komo.service;

import com.komo.entity.DailyRecommendation;
import com.komo.entity.User;
import com.komo.exception.BusinessException;
import com.komo.repository.ConversationRepository;
import com.komo.repository.DailyRecommendationRepository;
import com.komo.repository.KnowledgeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.Page;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DailyRecommendationServiceTest {
    private final UUID userId = UUID.randomUUID();
    private final DailyRecommendationRepository records = mock(DailyRecommendationRepository.class);
    private final KnowledgeRepository knowledge = mock(KnowledgeRepository.class);
    private final KnowledgeBaseService bases = mock(KnowledgeBaseService.class);
    private final UserService users = mock(UserService.class);
    private final ConversationRepository chats = mock(ConversationRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final RestTemplate http = mock(RestTemplate.class);
    private DailyRecommendationService service;
    private DailyRecommendation existing;
    private boolean inTransaction;

    @BeforeEach
    void setup() {
        service = new DailyRecommendationService(records, knowledge, bases, users, chats, tx, http);
        ReflectionTestUtils.setField(service, "aiBaseUrl", "http://ai.invalid");
        when(users.findById(userId)).thenReturn(User.builder().dailyRecommendationEnabled(true).build());
        existing = DailyRecommendation.builder().userId(userId).question("old question")
            .dimension("deepening").status("ACTIVE").build();
        when(records.findTopByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            eq(userId), any(), any())).thenReturn(Optional.of(existing));
        when(knowledge.findByUserIdAndFilters(eq(userId), isNull(), isNull(), isNull(), any())).thenReturn(Page.empty());
        when(tx.execute(any())).thenAnswer(invocation -> {
            inTransaction = true;
            try {
                return ((TransactionCallback<?>) invocation.getArgument(0)).doInTransaction(new SimpleTransactionStatus());
            } finally { inTransaction = false; }
        });
        when(records.save(any())).thenAnswer(invocation -> {
            assertTrue(inTransaction);
            return invocation.getArgument(0);
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"DISMISSED", "CONVERSED", "SAVED"})
    void handledRecommendationDoesNotRegenerateOnSameDay(String status) {
        existing.setStatus(status);
        assertNull(service.getTodayRecommendation(userId));
        assertNull(service.generateTodayRecommendation(userId, false));
        verifyNoInteractions(http, tx);
    }

    @Test
    void activeRecommendationIsReusedWithInclusiveDayStartAndExclusiveNextDay() {
        assertSame(existing, service.generateTodayRecommendation(userId, false));
        var today = LocalDate.now().atStartOfDay();
        verify(records).findTopByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            userId, today, today.plusDays(1));
        verifyNoInteractions(http, tx);
    }

    @Test
    void providerFailurePreservesOldRecommendation() {
        when(http.postForObject(anyString(), any(), eq(Map.class))).thenThrow(new RuntimeException("timeout"));
        assertThrows(BusinessException.class, () -> service.generateTodayRecommendation(userId, true));
        assertEquals("ACTIVE", existing.getStatus());
        verifyNoInteractions(tx);
    }

    @Test
    void emptyGenerationDoesNotDismissExistingRecommendation() {
        when(http.postForObject(anyString(), any(), eq(Map.class))).thenReturn(Map.of("questions", List.of()));
        assertNull(service.generateTodayRecommendation(userId, true));
        assertEquals("ACTIVE", existing.getStatus());
        verifyNoInteractions(tx);
    }

    @Test
    void forceReplacesOldRecommendationOnlyAfterAiReturnsAndInOneTransaction() {
        when(records.findByUserIdAndStatus(userId, "ACTIVE")).thenReturn(List.of(existing));
        when(http.postForObject(anyString(), any(), eq(Map.class))).thenAnswer(invocation -> {
            assertFalse(inTransaction);
            assertEquals("ACTIVE", existing.getStatus());
            return Map.of("questions", List.of(Map.of("text", "new question", "dimension", "deepening")));
        });
        DailyRecommendation result = service.generateTodayRecommendation(userId, true);
        assertEquals("new question", result.getQuestion());
        assertEquals("ACTIVE", result.getStatus());
        assertEquals("DISMISSED", existing.getStatus());
        verify(tx, times(1)).execute(any());
        verify(records, times(2)).save(any());
    }

    @Test
    void newDayWithoutRecordsCanGenerate() {
        when(records.findTopByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            eq(userId), any(), any())).thenReturn(Optional.empty());
        when(http.postForObject(anyString(), any(), eq(Map.class)))
            .thenReturn(Map.of("questions", List.of(Map.of("text", "today", "dimension", "deepening"))));
        assertEquals("today", service.generateTodayRecommendation(userId, false).getQuestion());
    }
}
