package com.komo.service;

import com.komo.entity.KnowledgeEntry;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.util.UUID;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;

class KnowledgeServiceMergeTest {

    @Test
    void retriesOptimisticConflictAndSyncsLinksInsideTheSuccessfulTransaction() {
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
        KnowledgeEntry fragment = KnowledgeEntry.builder().userId(userId).title("fragment").content("fragment body").build();
        fragment.setId(fragmentId);
        KnowledgeRepository entries = mock(KnowledgeRepository.class);
        when(entries.findById(targetId)).thenReturn(Optional.of(merged));
        when(entries.findById(fragmentId)).thenReturn(Optional.of(fragment));
        when(entries.save(any())).thenAnswer(call -> call.getArgument(0));
        AtomicBoolean inTransaction = new AtomicBoolean();

        TransactionTemplate transactions = mock(TransactionTemplate.class);
        when(transactions.execute(any()))
            .thenThrow(new ObjectOptimisticLockingFailureException(KnowledgeEntry.class, targetId))
            .thenAnswer(call -> {
                inTransaction.set(true);
                try { return ((TransactionCallback<?>) call.getArgument(0)).doInTransaction(new SimpleTransactionStatus()); }
                finally { inTransaction.set(false); }
            });
        KnowledgeRetrievalService indexService = mock(KnowledgeRetrievalService.class);
        WikiLinkService wikiLinkService = mock(WikiLinkService.class);
        doAnswer(call -> { assertTrue(inTransaction.get()); return null; })
            .when(wikiLinkService).syncLinks(userId, targetId);
        KnowledgeService service = new KnowledgeService(
            entries,
            mock(KnowledgeLinkRepository.class),
            indexService,
            mock(KnowledgeBaseService.class),
            wikiLinkService,
            transactions,
            mock(com.komo.repository.CategoryRepository.class), mock(com.komo.repository.ConversationRepository.class)
        );

        SecurityContext.setCurrentUserId(userId);
        try { assertSame(merged, service.mergeInto(fragmentId, targetId)); }
        finally { SecurityContext.clear(); }
        verify(transactions, times(2)).execute(any());
        verify(wikiLinkService).syncLinks(userId, targetId);
    }
}
