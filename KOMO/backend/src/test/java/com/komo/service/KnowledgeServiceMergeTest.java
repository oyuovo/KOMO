package com.komo.service;

import com.komo.entity.KnowledgeEntry;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KnowledgeServiceMergeTest {

    @Test
    void retriesOptimisticConflictInANewTransactionBeforeSyncingIndex() {
        UUID fragmentId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        KnowledgeEntry merged = KnowledgeEntry.builder()
            .userId(userId)
            .title("target")
            .content("merged")
            .contentPlain("merged")
            .build();
        merged.setId(targetId);

        TransactionTemplate transactions = mock(TransactionTemplate.class);
        when(transactions.execute(any()))
            .thenThrow(new ObjectOptimisticLockingFailureException(KnowledgeEntry.class, targetId))
            .thenReturn(merged);
        KnowledgeIndexService indexService = mock(KnowledgeIndexService.class);
        KnowledgeService service = new KnowledgeService(
            mock(KnowledgeRepository.class),
            mock(KnowledgeLinkRepository.class),
            indexService,
            mock(KnowledgeBaseService.class),
            transactions
        );

        KnowledgeEntry result = service.mergeInto(fragmentId, targetId);

        assertSame(merged, result);
        verify(transactions, times(2)).execute(any());
        verify(indexService).updateEntry(targetId, userId, "target", "merged");
        verify(indexService).deleteEntry(fragmentId);
    }
}
