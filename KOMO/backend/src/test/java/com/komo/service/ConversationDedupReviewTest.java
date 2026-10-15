package com.komo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.komo.entity.KnowledgeDraft;
import com.komo.repository.ConversationRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.MessageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ConversationDedupReviewTest {
    private static final String TITLE = "事务边界";
    private static final String CONTENT = "这是此前文章没有包含的新例子，需要保留完整内容交给用户检查。".repeat(25);

    @ParameterizedTest
    @CsvSource({"ARTICLE,knowledge", "FRAGMENT,knowledge", "SUPPLEMENT,knowledge",
        "ARTICLE,draft", "FRAGMENT,draft", "SUPPLEMENT,draft"})
    void sameTitleNeverSilentlyDiscardsNewContent(String type, String source) throws Exception {
        Fixture f = new Fixture(type);
        UUID matchedId = UUID.randomUUID();
        if (source.equals("knowledge")) {
            when(f.index.findSimilar(f.user, TITLE, CONTENT, 5)).thenReturn(List.of(hit(matchedId, TITLE)));
        } else {
            KnowledgeDraft existing = KnowledgeDraft.builder().title(TITLE).content("不同的旧内容").build();
            existing.setId(matchedId);
            when(f.drafts.listAllPending(f.user)).thenReturn(List.of(existing));
        }

        KnowledgeDraft saved = f.extract();

        assertEquals(KnowledgeDraft.RelationType.DUPLICATE, saved.getRelationType());
        assertEquals(KnowledgeDraft.DraftStatus.PENDING, saved.getStatus());
        assertEquals(CONTENT, saved.getContent());
        assertEquals(type, saved.getExtractType().name());
        var detail = new ObjectMapper().readTree(saved.getRelationDetail());
        assertEquals(matchedId.toString(), detail.get(source.equals("knowledge") ? "matchedEntryId" : "matchedDraftId").asText());
        assertFalse(detail.has("parentEntryId"));
        verify(f.http, never()).postForObject(contains("/api/dedup/check"), any(), eq(Map.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"DUPLICATE", "SUPPLEMENTS"})
    void modelAdviceUsesTheSelectedCandidateAndStillSavesTheDraft(String verdict) throws Exception {
        Fixture f = new Fixture("ARTICLE");
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        when(f.index.findSimilar(f.user, TITLE, CONTENT, 5))
            .thenReturn(List.of(hit(first, "缓存淘汰"), hit(second, "消息确认")));
        when(f.http.postForObject(contains("/api/dedup/check"), any(), eq(Map.class)))
            .thenReturn(Map.of("verdict", verdict, "confidence", 0.99, "matched_index", 1,
                "matchedEntryId", UUID.randomUUID().toString()));

        KnowledgeDraft saved = f.extract();

        assertEquals(KnowledgeDraft.RelationType.valueOf(verdict), saved.getRelationType());
        assertEquals(CONTENT, saved.getContent());
        assertEquals(KnowledgeDraft.DraftStatus.PENDING, saved.getStatus());
        var detail = new ObjectMapper().readTree(saved.getRelationDetail());
        assertEquals(second.toString(), detail.get(verdict.equals("DUPLICATE") ? "matchedEntryId" : "parentEntryId").asText());
    }

    @ParameterizedTest
    @ValueSource(doubles = {-1, 100, 0.5})
    void invalidModelCandidateIndexNeverInventsALink(double index) throws Exception {
        Fixture f = new Fixture("ARTICLE");
        when(f.index.findSimilar(f.user, TITLE, CONTENT, 5))
            .thenReturn(List.of(hit(UUID.randomUUID(), "缓存淘汰")));
        when(f.http.postForObject(contains("/api/dedup/check"), any(), eq(Map.class)))
            .thenReturn(Map.of("verdict", "DUPLICATE", "matched_index", index,
                "matchedEntryId", UUID.randomUUID().toString()));

        KnowledgeDraft saved = f.extract();

        assertEquals(KnowledgeDraft.RelationType.DUPLICATE, saved.getRelationType());
        assertFalse(new ObjectMapper().readTree(saved.getRelationDetail()).has("matchedEntryId"));
        assertEquals(CONTENT, saved.getContent());
    }

    @Test
    void modelFailureKeepsContentAsPending() {
        Fixture f = new Fixture("ARTICLE");
        when(f.index.findSimilar(f.user, TITLE, CONTENT, 5))
            .thenReturn(List.of(hit(UUID.randomUUID(), "缓存淘汰")));
        when(f.http.postForObject(contains("/api/dedup/check"), any(), eq(Map.class)))
            .thenThrow(new IllegalStateException("forced test model failure"));

        KnowledgeDraft saved = f.extract();

        assertEquals(KnowledgeDraft.RelationType.NEW, saved.getRelationType());
        assertEquals(CONTENT, saved.getContent());
    }

    @Test
    void contradictionAdviceRemainsVisible() {
        Fixture f = new Fixture("ARTICLE");
        when(f.index.findSimilar(f.user, TITLE, CONTENT, 5))
            .thenReturn(List.of(hit(UUID.randomUUID(), "缓存淘汰")));
        when(f.http.postForObject(contains("/api/dedup/check"), any(), eq(Map.class)))
            .thenReturn(Map.of("verdict", "CONTRADICTS", "matched_index", 0));
        assertEquals(KnowledgeDraft.RelationType.CONTRADICTS, f.extract().getRelationType());
    }

    @Test
    void alreadyProcessedMessageDoesNotCreateAnotherReviewDraft() {
        Fixture f = new Fixture("ARTICLE");
        when(f.drafts.hasDraftsForMessage(f.message, f.user)).thenReturn(true);
        f.service.extractAndSaveDrafts(f.user, f.conversation, f.message, List.of());
        verifyNoInteractions(f.http);
        verify(f.drafts, never()).saveExtractedDrafts(any(), any(), any(), any());
    }

    @Test
    void missingTitlesDoNotCountAsIdenticalAndRawScoreIsActuallyRaw() {
        Fixture f = new Fixture("FRAGMENT");
        when(f.index.findSimilar(f.user, "", CONTENT, 5))
            .thenReturn(List.of(hit(UUID.randomUUID(), "")));
        var result = new DedupService(f.index, f.drafts).checkDuplicate(f.user, "", CONTENT);
        assertEquals(0.3, result.getScore(), 0.0001);
        assertEquals(18.0, result.getMltRawScore());
        assertEquals(0.0, result.getTitleLcsScore());
    }

    private static Map<String, Object> hit(UUID id, String title) {
        return Map.of("_id", id.toString(), "title", title, "contentPlain", "已有内容", "_score", 18.0);
    }

    private static class Fixture {
        final UUID user = UUID.randomUUID();
        final UUID conversation = UUID.randomUUID();
        final UUID message = UUID.randomUUID();
        final KnowledgeDraftService drafts = mock(KnowledgeDraftService.class);
        final KnowledgeIndexService index = mock(KnowledgeIndexService.class);
        final RestTemplate http = mock(RestTemplate.class);
        final ConversationService service;

        Fixture(String type) {
            service = new ConversationService(mock(ConversationRepository.class), mock(MessageRepository.class),
                mock(ConversationPersistenceService.class), drafts, index, mock(KnowledgeBaseService.class),
                mock(KnowledgeRepository.class), new DedupService(index, drafts), mock(RabbitTemplate.class),
                mock(UserService.class), http);
            ReflectionTestUtils.setField(service, "aiBaseUrl", "http://test.invalid");
            when(http.postForObject(contains("/api/extraction/extract"), any(), eq(Map.class)))
                .thenReturn(Map.of("knowledge_points", List.of(Map.of("title", TITLE, "content", CONTENT,
                    "confidence", 0.8, "type", type))));
        }

        @SuppressWarnings({"unchecked", "rawtypes"})
        KnowledgeDraft extract() {
            service.extractAndSaveDrafts(user, conversation, message, List.of(Map.of("role", "assistant", "content", CONTENT)));
            ArgumentCaptor<List<KnowledgeDraft>> saved = ArgumentCaptor.forClass((Class) List.class);
            verify(drafts).saveExtractedDrafts(eq(user), eq(conversation), eq(message), saved.capture());
            assertEquals(1, saved.getValue().size());
            return saved.getValue().getFirst();
        }
    }
}
