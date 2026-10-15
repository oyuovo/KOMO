package com.komo.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.mapping.Property;
import co.elastic.clients.elasticsearch.core.IndexRequest;
import co.elastic.clients.elasticsearch.core.IndexResponse;
import co.elastic.clients.elasticsearch.core.DeleteByQueryRequest;
import co.elastic.clients.elasticsearch.core.DeleteByQueryResponse;
import co.elastic.clients.elasticsearch.core.SearchRequest;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.indices.DeleteIndexRequest;
import co.elastic.clients.elasticsearch.indices.DeleteIndexResponse;
import co.elastic.clients.elasticsearch.indices.ElasticsearchIndicesClient;
import co.elastic.clients.elasticsearch.indices.ExistsRequest;
import co.elastic.clients.elasticsearch.indices.GetMappingRequest;
import co.elastic.clients.elasticsearch.indices.GetMappingResponse;
import co.elastic.clients.elasticsearch.indices.CreateIndexRequest;
import co.elastic.clients.elasticsearch.indices.RefreshRequest;
import co.elastic.clients.elasticsearch.indices.RefreshResponse;
import co.elastic.clients.transport.endpoints.BooleanResponse;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.io.IOException;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

@SuppressWarnings({"unchecked", "rawtypes"})
class KnowledgeIndexServiceTest {
    private final UUID userId = UUID.randomUUID();
    private final UUID kbId = UUID.randomUUID();
    private ElasticsearchClient client;
    private ElasticsearchIndicesClient indices;
    private KnowledgeIndexService service;

    @BeforeEach
    void setUp() throws Exception {
        // Keep the real request-builder overloads, intercept only completed ES requests.
        client = mock(ElasticsearchClient.class, CALLS_REAL_METHODS);
        indices = mock(ElasticsearchIndicesClient.class, CALLS_REAL_METHODS);
        doReturn(indices).when(client).indices();
        doReturn(new BooleanResponse(true)).when(indices).exists(any(ExistsRequest.class));
        doReturn(mock(DeleteIndexResponse.class)).when(indices).delete(any(DeleteIndexRequest.class));
        doReturn(mock(IndexResponse.class)).when(client).index(any(IndexRequest.class));
        doReturn(DeleteByQueryResponse.of(r -> r.deleted(1L).timedOut(false).versionConflicts(0L)))
            .when(client).deleteByQuery(any(DeleteByQueryRequest.class));
        doReturn(RefreshResponse.of(r -> r.shards(s -> s.total(1).successful(1).failed(0))))
            .when(indices).refresh(any(RefreshRequest.class));
        doReturn(SearchResponse.of(r -> r.took(0).timedOut(false)
            .shards(s -> s.total(1).successful(1).failed(0)).hits(h -> h.hits(List.of()))))
            .when(client).search(any(SearchRequest.class), eq(Map.class));
        mapping(false);
        service = new KnowledgeIndexService(client);
        SecurityContext.setCurrentUserId(userId);
    }

    @AfterEach
    void clearContext() {
        SecurityContext.clear();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void searchUsesTheActualKeywordFieldsAndKeepsBothScopeFilters(boolean legacy) throws Exception {
        mapping(legacy);
        String suffix = legacy ? ".keyword" : "";
        service.search(userId, "事务", 3, kbId);

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Map.class));
        var filters = request.getValue().query().bool().filter();
        assertEquals(2, filters.size());
        assertTrue(filters.stream().anyMatch(q -> q.isTerm()
            && q.term().field().equals("userId" + suffix) && q.term().value().stringValue().equals(userId.toString())));
        assertTrue(filters.stream().anyMatch(q -> q.isTerm()
            && q.term().field().equals("knowledgeBaseId" + suffix) && q.term().value().stringValue().equals(kbId.toString())));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void dedupUsesExactUserFiltering(boolean legacy) throws Exception {
        mapping(legacy);
        service.findSimilar(userId, "事务", "事务隔离与一致性", 5);

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Map.class));
        var filters = request.getValue().query().bool().filter();
        assertEquals(1, filters.size());
        assertEquals(legacy ? "userId.keyword" : "userId", filters.getFirst().term().field());
        assertEquals(userId.toString(), filters.getFirst().term().value().stringValue());
    }

    @Test
    void rebuildingOneUserNeverDeletesTheSharedIndex() throws Exception {
        KnowledgeRepository repository = mock(KnowledgeRepository.class);
        KnowledgeEntry entry = KnowledgeEntry.builder().userId(userId).knowledgeBaseId(kbId)
            .title("事务").content("事务隔离").contentPlain("事务隔离").build();
        entry.setId(UUID.randomUUID());
        when(repository.findAllByUserIdAndDeletedAtIsNull(userId)).thenReturn(List.of(entry));
        KnowledgeService knowledge = new KnowledgeService(repository, mock(KnowledgeLinkRepository.class),
            service, mock(KnowledgeBaseService.class), mock(WikiLinkService.class), mock(TransactionTemplate.class));

        assertEquals(1, knowledge.reindexAll());

        verify(indices, never()).delete(any(DeleteIndexRequest.class));
        ArgumentCaptor<DeleteByQueryRequest> deletion = ArgumentCaptor.forClass(DeleteByQueryRequest.class);
        verify(client).deleteByQuery(deletion.capture());
        assertEquals(userId.toString(), deletion.getValue().query().bool().filter().getFirst().term().value().stringValue());
        verify(indices, times(2)).refresh(any(RefreshRequest.class));
    }

    @Test
    void searchWithoutKnowledgeBaseStillRequiresTheUser() throws Exception {
        service.search(userId, "事务", 3, null);

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Map.class));
        assertEquals(1, request.getValue().query().bool().filter().size());
        assertEquals(userId.toString(), request.getValue().query().bool().filter().getFirst().term().value().stringValue());
    }

    @Test
    void analyzedUserFieldWithoutKeywordSubfieldNeverFallsBackToAnUnsafeSearch() throws Exception {
        doReturn(GetMappingResponse.of(r -> r.result(KnowledgeIndexService.INDEX_NAME,
            m -> m.mappings(t -> t.properties("userId", p -> p.text(v -> v))))))
            .when(indices).getMapping(any(GetMappingRequest.class));

        assertTrue(service.search(userId, "事务", 3, null).isEmpty());
        assertTrue(service.findSimilar(userId, "事务", "事务隔离", 5).isEmpty());
        assertThrows(BusinessException.class, () -> service.reindexUser(userId, List.of()));
        verify(client, never()).search(any(SearchRequest.class), eq(Map.class));
        verify(client, never()).deleteByQuery(any(DeleteByQueryRequest.class));
    }

    @Test
    void absentKnowledgeBaseFieldMatchesNothingInsteadOfDroppingTheScope() throws Exception {
        doReturn(GetMappingResponse.of(r -> r.result(KnowledgeIndexService.INDEX_NAME,
            m -> m.mappings(t -> t.properties("userId", p -> p.keyword(v -> v))))))
            .when(indices).getMapping(any(GetMappingRequest.class));

        service.search(userId, "事务", 3, kbId);

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Map.class));
        assertTrue(request.getValue().query().bool().filter().stream().anyMatch(q -> q.isMatchNone()));
    }

    @Test
    void emptyUserRebuildStillRemovesOnlyThatUsersStaleDocuments() throws Exception {
        mapping(true);
        assertEquals(0, service.reindexUser(userId, List.of()));

        ArgumentCaptor<DeleteByQueryRequest> request = ArgumentCaptor.forClass(DeleteByQueryRequest.class);
        verify(client).deleteByQuery(request.capture());
        var term = request.getValue().query().bool().filter().getFirst().term();
        assertEquals("userId.keyword", term.field());
        assertEquals(userId.toString(), term.value().stringValue());
        verify(client, never()).index(any(IndexRequest.class));
        verify(indices, never()).delete(any(DeleteIndexRequest.class));
    }

    @Test
    void rejectsForeignEntriesBeforeAnyDeletionOrWrite() throws Exception {
        BusinessException error = assertThrows(BusinessException.class,
            () -> service.reindexUser(userId, List.of(entry(UUID.randomUUID()))));
        assertEquals(ErrorCode.FORBIDDEN, error.getErrorCode());
        verify(client, never()).deleteByQuery(any(DeleteByQueryRequest.class));
        verify(client, never()).index(any(IndexRequest.class));
        verify(indices, never()).refresh(any(RefreshRequest.class));
    }

    @Test
    void softDeletedEntriesAreNotReinserted() throws Exception {
        KnowledgeEntry deleted = entry(userId);
        deleted.setDeletedAt(LocalDateTime.now());
        assertEquals(0, service.reindexUser(userId, List.of(deleted)));
        verify(client, never()).index(any(IndexRequest.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"timeout", "conflict", "failure"})
    void incompleteDeletionFailsWithoutWritingOrReportingSuccess(String reason) throws Exception {
        doReturn(DeleteByQueryResponse.of(r -> {
            r.timedOut(reason.equals("timeout")).versionConflicts(reason.equals("conflict") ? 1L : 0L);
            if (reason.equals("failure")) {
                r.failures(f -> f.index(KnowledgeIndexService.INDEX_NAME).type("_doc").id("test-document").status(500)
                    .cause(c -> c.type("test_failure").reason("forced test failure")));
            }
            return r;
        })).when(client).deleteByQuery(any(DeleteByQueryRequest.class));

        assertThrows(BusinessException.class, () -> service.reindexUser(userId, List.of(entry(userId))));
        verify(client, never()).index(any(IndexRequest.class));
    }

    @Test
    void exhaustedIndexWritesReturnAGenericErrorInsteadOfASuccessCount() throws Exception {
        doThrow(new IOException("forced test write failure")).when(client).index(any(IndexRequest.class));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.reindexUser(userId, List.of(entry(userId))));

        assertEquals("知识索引重建失败，请稍后重试", error.getMessage());
        verify(client, times(3)).index(any(IndexRequest.class));
    }

    @Test
    void failedIndexCreationStopsBeforeAutoMappingOrDeletingData() throws Exception {
        doReturn(new BooleanResponse(false)).when(indices).exists(any(ExistsRequest.class));
        doThrow(new IOException("forced test mapping failure")).when(indices).create(any(CreateIndexRequest.class));

        assertThrows(BusinessException.class, () -> service.reindexUser(userId, List.of(entry(userId))));
        verify(client, never()).deleteByQuery(any(DeleteByQueryRequest.class));
        verify(client, never()).index(any(IndexRequest.class));
    }

    @Test
    void aFailedFinalRefreshIsNotReportedAsACompletedRebuild() throws Exception {
        doReturn(RefreshResponse.of(r -> r.shards(s -> s.total(1).successful(1).failed(0))),
            RefreshResponse.of(r -> r.shards(s -> s.total(1).successful(0).failed(1))))
            .when(indices).refresh(any(RefreshRequest.class));

        assertThrows(BusinessException.class, () -> service.reindexUser(userId, List.of(entry(userId))));
        verify(client).index(any(IndexRequest.class));
    }

    private KnowledgeEntry entry(UUID owner) {
        KnowledgeEntry entry = KnowledgeEntry.builder().userId(owner).knowledgeBaseId(kbId)
            .title("事务").content("事务隔离").contentPlain("事务隔离").build();
        entry.setId(UUID.randomUUID());
        return entry;
    }

    private void mapping(boolean legacy) throws Exception {
        Property id = legacy
            ? Property.of(p -> p.text(t -> t.fields("keyword", f -> f.keyword(k -> k))))
            : Property.of(p -> p.keyword(k -> k));
        doReturn(GetMappingResponse.of(r -> r.result(KnowledgeIndexService.INDEX_NAME,
            m -> m.mappings(t -> t.properties("userId", id).properties("knowledgeBaseId", id)))))
            .when(indices).getMapping(any(GetMappingRequest.class));
    }
}
