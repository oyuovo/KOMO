package com.komo.service;

import com.komo.entity.KnowledgeEntry;
import com.komo.repository.KnowledgeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Opt-in real Java -> Python -> Qdrant/embedding check. No database writes or generation. */
@EnabledIfEnvironmentVariable(named="RETRIEVAL_IT_URL", matches=".+")
class KnowledgeRetrievalGatewayIT {
    @Test
    @Timeout(120)
    void realGatewayIndexesSearchesUpdatesAndPrunesOnlyItsTemporaryUser() {
        UUID user = UUID.randomUUID(), id = UUID.randomUUID();
        KnowledgeRepository repository = mock(KnowledgeRepository.class);
        KnowledgeEntry entry = KnowledgeEntry.builder().userId(user).title("事务😀")
            .content("# ERR_LOCK_409\n🙂版本冲突后需要重新读取状态，再开启新的事务。\n").build();
        entry.setId(id);
        when(repository.findByUserIdAndFilters(eq(user), isNull(), isNull(), isNull(), any()))
            .thenAnswer(call -> new PageImpl<>(List.of(entry)));
        when(repository.findAllByIdsAndUserId(anyList(), eq(user))).thenReturn(List.of(entry));
        KnowledgeRetrievalService service = new KnowledgeRetrievalService(repository, new RestTemplate());
        ReflectionTestUtils.setField(service, "aiBaseUrl", System.getenv("RETRIEVAL_IT_URL"));
        ReflectionTestUtils.setField(service, "internalToken", System.getenv("AI_INTERNAL_TOKEN"));
        try {
            var before = service.search(user, "ERR_LOCK_409怎么处理？", 3, null);
            assertEquals(1, before.size());
            assertEquals(entry.getContent(), before.getFirst().get("content"));
            entry.setContent("# ERR_LOCK_409\n新版规定：先向用户展示冲突差异，由用户决定是否重试。\n");
            var after = service.search(user, "ERR_LOCK_409怎么处理？", 3, null);
            assertEquals(entry.getContent(), after.getFirst().get("content"));
            assertNotEquals(before.getFirst().get("revision"), after.getFirst().get("revision"));
        } finally {
            when(repository.findByUserIdAndFilters(eq(user), isNull(), isNull(), isNull(), any()))
                .thenReturn(new PageImpl<>(List.of()));
            assertEquals(0, service.reindexUser(user));
        }
    }
}
