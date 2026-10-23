package com.komo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.repository.KnowledgeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.HttpEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class KnowledgeRetrievalServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final UUID user = UUID.randomUUID(), kb = UUID.randomUUID(), id = UUID.randomUUID();
    private final KnowledgeRepository repository = mock(KnowledgeRepository.class);
    private final RestTemplate http = mock(RestTemplate.class);
    private final KnowledgeRetrievalService service = new KnowledgeRetrievalService(repository, http);
    private final KnowledgeEntry entry = KnowledgeEntry.builder().userId(user).knowledgeBaseId(kb)
        .title("事务").content("🙂版本冲突后重新读取，再重试。").build();

    @BeforeEach
    void setup() {
        entry.setId(id);
        ReflectionTestUtils.setField(service, "aiBaseUrl", "http://ai.invalid");
        ReflectionTestUtils.setField(service, "internalToken", "test-only-service-token-0123456789");
        when(repository.findByUserIdAndFilters(eq(user), isNull(), any(), isNull(), any()))
            .thenReturn(new PageImpl<>(List.of(entry)));
        when(repository.findAllByIdsAndUserId(anyList(), eq(user))).thenReturn(List.of(entry));
        when(http.postForObject(endsWith("/missing"), any(), eq(JsonNode.class)))
            .thenReturn(json.valueToTree(Map.of("missing", List.of(id.toString()))));
        when(http.postForObject(endsWith("/index"), any(), eq(JsonNode.class)))
            .thenReturn(json.valueToTree(Map.of("indexed", true)));
        when(http.postForObject(endsWith("/search"), any(), eq(JsonNode.class))).thenReturn(reply(entry.getContent()));
    }

    private JsonNode reply(String text) {
        return json.valueToTree(Map.of("hits", List.of(Map.of("document_id", id.toString(),
            "revision", KnowledgeRetrievalService.revision(entry), "start_offset", 0,
            "end_offset", entry.getContent().codePointCount(0, entry.getContent().length()),
            "start_line", 1, "end_line", 1, "text", text, "score", .03))));
    }

    @Test
    void indexesOnlyRequestedSnapshotsThenValidatesSourceAndSendsInternalCredential() {
        var hits = service.search(user, "如何重试", 12, kb);
        assertEquals(entry.getContent(), hits.getFirst().get("content"));
        verify(http).postForObject(endsWith("/index"), argThat(value -> {
            HttpEntity<?> request = (HttpEntity<?>) value;
            JsonNode body = json.valueToTree(request.getBody());
            return body.path("user_id").asText().equals(user.toString())
                && body.path("document").path("id").asText().equals(id.toString())
                && request.getHeaders().getFirst("X-Internal-Token").length() >= 32;
        }), eq(JsonNode.class));
        verify(repository).findAllByIdsAndUserId(List.of(id), user);
    }

    @Test
    void forgedEvidenceIsRejected() {
        when(http.postForObject(endsWith("/search"), any(), eq(JsonNode.class))).thenReturn(reply("捏造的原文"));
        assertThrows(BusinessException.class, () -> service.search(user, "重试", 12, kb));
    }

    @ParameterizedTest
    @ValueSource(strings={"deleted", "edited", "moved", "foreign"})
    void changesDuringRetrievalAreExcludedBeforeTheyReachTheModel(String change) {
        when(repository.findAllByIdsAndUserId(anyList(), eq(user))).thenAnswer(call -> {
            switch (change) {
                case "deleted" -> entry.setDeletedAt(LocalDateTime.now());
                case "edited" -> entry.setContent("新版本");
                case "moved" -> entry.setKnowledgeBaseId(UUID.randomUUID());
                case "foreign" -> entry.setUserId(UUID.randomUUID());
            }
            return List.of(entry);
        });
        assertTrue(service.search(user, "重试", 12, kb).isEmpty());
    }

    @Test
    void foreignMissingDocumentCannotTriggerAnUnscopedDatabaseFetch() {
        when(http.postForObject(endsWith("/missing"), any(), eq(JsonNode.class)))
            .thenReturn(json.valueToTree(Map.of("missing", List.of(UUID.randomUUID().toString()))));
        assertThrows(BusinessException.class, () -> service.search(user, "重试", 12, kb));
        verify(http, never()).postForObject(endsWith("/index"), any(), eq(JsonNode.class));
        verify(repository, never()).findAllByIdsAndUserId(anyList(), any());
    }

    @Test
    void retrievalFailureIsNotReportedAsAnEmptyKnowledgeBase() {
        when(http.postForObject(endsWith("/missing"), any(), eq(JsonNode.class)))
            .thenThrow(new IllegalStateException("upstream unavailable"));
        assertThrows(BusinessException.class, () -> service.search(user, "重试", 12, kb));
    }

    @Test
    void emptyUserRebuildPrunesOnlyThatUsersOldVersions() {
        when(repository.findByUserIdAndFilters(eq(user), isNull(), isNull(), isNull(), any()))
            .thenReturn(new PageImpl<>(List.of()));
        when(http.postForObject(endsWith("/missing"), any(), eq(JsonNode.class)))
            .thenReturn(json.valueToTree(Map.of("missing", List.of())));
        when(http.postForObject(endsWith("/prune"), any(), eq(JsonNode.class)))
            .thenReturn(json.valueToTree(Map.of("removed", 4)));
        assertEquals(0, service.reindexUser(user));
        verify(http).postForObject(endsWith("/prune"), argThat(value -> {
            JsonNode body = json.valueToTree(((HttpEntity<?>) value).getBody());
            return body.path("user_id").asText().equals(user.toString()) && body.path("manifest").isEmpty();
        }), eq(JsonNode.class));
    }
}
