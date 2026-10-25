package com.komo.service;

import com.komo.entity.KnowledgeBase;
import com.komo.entity.KnowledgeDraft;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeLink;
import com.komo.exception.BusinessException;
import com.komo.repository.KnowledgeBaseRepository;
import com.komo.repository.KnowledgeDraftRepository;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class KnowledgeDraftConfirmationTest {
    private final UUID user = UUID.randomUUID();
    private final UUID draftId = UUID.randomUUID();
    private final UUID kbId = UUID.randomUUID();
    private final UUID parentId = UUID.randomUUID();
    private final KnowledgeDraftRepository drafts = mock(KnowledgeDraftRepository.class);
    private final KnowledgeRepository entries = mock(KnowledgeRepository.class);
    private final KnowledgeBaseRepository bases = mock(KnowledgeBaseRepository.class);
    private final KnowledgeLinkRepository links = mock(KnowledgeLinkRepository.class);
    private final WikiLinkService wiki = mock(WikiLinkService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private KnowledgeDraftService service;
    private KnowledgeDraft draft;
    private KnowledgeEntry parent;
    private boolean inTransaction;

    @BeforeEach
    void setup() {
        SecurityContext.setCurrentUserId(user);
        service = new KnowledgeDraftService(drafts, entries, new KnowledgeBaseService(bases, entries,
            mock(com.komo.repository.CategoryRepository.class), mock(com.komo.repository.ConversationRepository.class),
            mock(com.komo.repository.DailyRecommendationRepository.class)), links, wiki, tx);
        draft = KnowledgeDraft.builder().userId(user).title("新补充").content("需要保存的正文")
            .extractType(KnowledgeDraft.ExtractType.SUPPLEMENT).build();
        draft.setId(draftId);
        parent = KnowledgeEntry.builder().userId(user).knowledgeBaseId(kbId).title("原文章").content("原正文").build();
        parent.setId(parentId);
        KnowledgeBase kb = KnowledgeBase.builder().userId(user).name("自己的知识库").build();
        kb.setId(kbId);
        when(drafts.findByIdAndUserIdForUpdate(draftId, user)).thenReturn(Optional.of(draft));
        when(entries.findByIdAndUserId(parentId, user)).thenReturn(Optional.of(parent));
        when(bases.findByIdAndUserIdForUpdate(kbId, user)).thenReturn(Optional.of(kb));
        when(bases.findAllByUserIdAndType(eq(user), any())).thenReturn(List.of(kb));
        when(tx.execute(any())).thenAnswer(invocation -> {
            inTransaction = true;
            try {
                return ((TransactionCallback<?>) invocation.getArgument(0)).doInTransaction(new SimpleTransactionStatus());
            } finally {
                inTransaction = false;
            }
        });
        when(entries.save(any())).thenAnswer(invocation -> {
            assertTrue(inTransaction);
            KnowledgeEntry entry = invocation.getArgument(0);
            entry.setId(UUID.randomUUID());
            return entry;
        });
        when(links.save(any())).thenAnswer(invocation -> {
            assertTrue(inTransaction);
            return invocation.getArgument(0);
        });
        when(drafts.save(any())).thenAnswer(invocation -> {
            assertTrue(inTransaction);
            return invocation.getArgument(0);
        });

        doAnswer(invocation -> {
            assertTrue(inTransaction, "Wiki sync must share the confirmation transaction");
            return null;
        }).when(wiki).syncLinks(any(), any());

    }

    @AfterEach
    void cleanup() {
        SecurityContext.clear();
    }

    @Test
    void confirmingWithParentCreatesLinkInParentsBaseWithoutChangingParentBody() {
        KnowledgeEntry saved = service.confirmWithParent(draftId, null, parentId);
        assertEquals(kbId, saved.getKnowledgeBaseId());
        assertEquals("原正文", parent.getContent());
        assertEquals(KnowledgeDraft.DraftStatus.CONFIRMED, draft.getStatus());
        verify(links).save(argThat(link -> link.getSourceEntryId().equals(saved.getId())
            && link.getTargetEntryId().equals(parentId)
            && link.getRelation() == KnowledgeLink.RelationType.SUPPLEMENTS));
    }

    @Test
    void specifyingKnowledgeBaseCannotBypassParentOwnership() {
        when(entries.findByIdAndUserId(parentId, user)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> service.confirmWithParent(draftId, kbId, parentId));
        assertNoWrites();
    }

    @Test
    void deletedParentCannotReceiveNewLinks() {
        parent.setDeletedAt(LocalDateTime.now());
        assertThrows(BusinessException.class, () -> service.confirmWithParent(draftId, null, parentId));
        assertNoWrites();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void cannotConfirmIntoAnotherUsersKnowledgeBase(boolean edited) {
        KnowledgeBase foreign = KnowledgeBase.builder().userId(UUID.randomUUID()).name("另一个用户").build();
        foreign.setId(kbId);
        when(bases.findByIdAndUserIdForUpdate(kbId, user)).thenReturn(Optional.of(foreign));
        assertThrows(BusinessException.class, () -> {
            if (edited) service.editAndConfirm(draftId, "新标题", "新正文", kbId);
            else service.confirmWithParent(draftId, kbId, null);
        });
        assertNoWrites();
    }

    private void assertNoWrites() {
        verify(entries, never()).save(any());
        verify(links, never()).save(any());
        verify(drafts, never()).save(any());
        verifyNoInteractions(wiki);
        assertEquals(KnowledgeDraft.DraftStatus.PENDING, draft.getStatus());
    }

    @Test
    void editedConfirmationKeepsTheChosenParent() {
        KnowledgeEntry saved = service.editAndConfirm(draftId, "编辑标题", "编辑正文", null, parentId);
        assertEquals("编辑标题", saved.getTitle());
        assertEquals("编辑正文", saved.getContent());
        assertEquals(kbId, saved.getKnowledgeBaseId());
        assertEquals(KnowledgeDraft.DraftStatus.EDITED, draft.getStatus());
        assertEquals("编辑正文", draft.getContent());
        verify(links).save(argThat(link -> link.getTargetEntryId().equals(parentId)));
        verify(wiki).syncLinks(user, saved.getId());
    }

    @Test
    void conflictingKnowledgeBaseAndParentFailsBeforeSaving() {
        assertThrows(BusinessException.class,
            () -> service.confirmWithParent(draftId, UUID.randomUUID(), parentId));
        assertNoWrites();
    }

    @Test
    void editedConfirmationAlsoChecksParentOwnershipEvenWithKnowledgeBase() {
        when(entries.findByIdAndUserId(parentId, user)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class,
            () -> service.editAndConfirm(draftId, "新标题", "新正文", kbId, parentId));
        assertEquals("新补充", draft.getTitle());
        assertNoWrites();
    }

    @Test
    void explicitlyIndependentConfirmationDoesNotReapplyStoredSuggestion() {
        draft.setRelationType(KnowledgeDraft.RelationType.SUPPLEMENTS);
        draft.setRelationDetail("{\"parentEntryId\":\"" + parentId + "\"}");
        service.confirm(draftId, kbId);
        verifyNoInteractions(links);
        verify(entries, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void missingKnowledgeBaseDoesNotLeaveAnOrphanEntry() {
        when(bases.findByIdAndUserIdForUpdate(kbId, user)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> service.confirm(draftId, kbId));
        assertNoWrites();
    }

    @Test
    void alreadyProcessedDraftCannotBeConfirmedTwice() {
        draft.setStatus(KnowledgeDraft.DraftStatus.CONFIRMED);
        assertThrows(BusinessException.class, () -> service.confirm(draftId, kbId));
        verify(entries, never()).save(any());
        verifyNoInteractions(links, wiki);
    }
}
