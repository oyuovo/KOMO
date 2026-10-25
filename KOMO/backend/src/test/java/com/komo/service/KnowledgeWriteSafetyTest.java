package com.komo.service;

import com.komo.dto.request.KnowledgeUpdateRequest;
import com.komo.dto.response.KnowledgeResponse;
import com.komo.entity.Category;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.CategoryRepository;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class KnowledgeWriteSafetyTest {
    private final UUID user = UUID.randomUUID();
    private final UUID id = UUID.randomUUID();
    private final UUID kb = UUID.randomUUID();
    private final KnowledgeRepository entries = mock(KnowledgeRepository.class);
    private final CategoryRepository categories = mock(CategoryRepository.class);
    private final WikiLinkService wiki = mock(WikiLinkService.class);
    private KnowledgeService service;
    private KnowledgeEntry entry;

    @BeforeEach
    void setup() {
        SecurityContext.setCurrentUserId(user);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(call ->
            ((TransactionCallback<?>) call.getArgument(0)).doInTransaction(new SimpleTransactionStatus()));
        service = new KnowledgeService(entries, mock(KnowledgeLinkRepository.class),
            mock(KnowledgeRetrievalService.class), mock(KnowledgeBaseService.class), wiki, tx, categories, mock(com.komo.repository.ConversationRepository.class));
        entry = KnowledgeEntry.builder().userId(user).knowledgeBaseId(kb).title("最新标题")
            .content("另一页面已经保存的新正文").contentPlain("另一页面已经保存的新正文")
            .tagNames("保留标签").entryType(KnowledgeEntry.KnowledgeType.METHOD).version(3L).build();
        entry.setId(id);
        when(entries.findById(id)).thenReturn(Optional.of(entry));
        when(entries.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    @AfterEach
    void cleanup() { SecurityContext.clear(); }

    private KnowledgeUpdateRequest update(Long version) {
        KnowledgeUpdateRequest req = new KnowledgeUpdateRequest();
        req.setVersion(version);
        req.setTitle("修改后的标题");
        req.setContent("修改后的正文");
        return req;
    }

    @Test
    void staleEditorCannotOverwriteNewContent() {
        BusinessException error = assertThrows(BusinessException.class, () -> service.update(id, update(2L)));
        assertEquals(ErrorCode.CONFLICT, error.getErrorCode());
        assertEquals("另一页面已经保存的新正文", entry.getContent());
        assertEquals("最新标题", entry.getTitle());
        verify(entries, never()).save(any());
        verifyNoInteractions(wiki);
    }

    @Test
    void versionlessClientCannotBypassConflictProtection() {
        assertThrows(BusinessException.class, () -> service.update(id, update(null)));
        verify(entries, never()).save(any());
    }

    @Test
    void editingWithoutTagsPreservesExistingTagsAndType() {
        service.update(id, update(3L));
        assertEquals("修改后的正文", entry.getContent());
        assertEquals("保留标签", entry.getTagNames());
        assertEquals(KnowledgeEntry.KnowledgeType.METHOD, entry.getEntryType());
        assertEquals(3L, KnowledgeResponse.from(entry).getVersion());
    }

    @Test
    void explicitEmptyTagsStillClearsTags() {
        var req = update(3L);
        req.setTags("");
        service.update(id, req);
        assertEquals("", entry.getTagNames());
    }

    @Test
    void categoryMoveOnlyChangesCategoryAndCanClearIt() {
        UUID categoryId = UUID.randomUUID();
        when(categories.findByIdAndUserIdForUpdate(categoryId, user)).thenReturn(Optional.of(
            Category.builder().userId(user).knowledgeBaseId(kb).build()));
        service.moveToCategory(id, categoryId);
        assertEquals(categoryId, entry.getCategoryId());
        assertEquals("另一页面已经保存的新正文", entry.getContent());
        assertEquals("最新标题", entry.getTitle());
        assertEquals("保留标签", entry.getTagNames());
        assertEquals(KnowledgeEntry.KnowledgeType.METHOD, entry.getEntryType());
        service.moveToCategory(id, null);
        assertNull(entry.getCategoryId());
        verifyNoInteractions(wiki);
    }

    @Test
    void categoryMoveRejectsOtherOwnersAndOtherKnowledgeBases() {
        UUID categoryId = UUID.randomUUID();
        when(categories.findByIdAndUserIdForUpdate(categoryId, user)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> service.moveToCategory(id, categoryId));
        when(categories.findByIdAndUserIdForUpdate(categoryId, user)).thenReturn(Optional.of(
            Category.builder().userId(user).knowledgeBaseId(UUID.randomUUID()).build()));
        assertThrows(BusinessException.class, () -> service.moveToCategory(id, categoryId));
        verify(entries, never()).save(any());
    }

    @Test
    void deletedArticleCannotBeEditedOrMoved() {
        entry.setDeletedAt(LocalDateTime.now());
        assertThrows(BusinessException.class, () -> service.update(id, update(3L)));
        assertThrows(BusinessException.class, () -> service.moveToCategory(id, null));
        verify(entries, never()).save(any());
    }
}
