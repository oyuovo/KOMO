package com.komo.service;

import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeLink;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WikiLinkServiceTest {

    private final KnowledgeRepository knowledgeRepository = mock(KnowledgeRepository.class);
    private final KnowledgeLinkRepository knowledgeLinkRepository = mock(KnowledgeLinkRepository.class);
    private final WikiLinkService service = new WikiLinkService(knowledgeRepository, knowledgeLinkRepository);

    private KnowledgeEntry entry(UUID id, UUID userId, String title, String content, UUID kbId) {
        KnowledgeEntry e = KnowledgeEntry.builder()
            .userId(userId)
            .title(title)
            .content(content)
            .knowledgeBaseId(kbId)
            .build();
        e.setId(id);
        e.setCreatedAt(LocalDateTime.now().minusDays(1));
        return e;
    }

    @Test
    void parsesWikiLinksAndCreatesRelatedLinks() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID kbId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();

        KnowledgeEntry source = entry(sourceId, userId, "来源", "参见 [[目标文章]]。", kbId);
        KnowledgeEntry target = entry(targetId, userId, "目标文章", "正文", kbId);

        when(knowledgeRepository.findByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        when(knowledgeRepository.findAllByUserIdAndTitleIgnoreCaseAndDeletedAtIsNull(userId, "目标文章"))
            .thenReturn(List.of(target));

        // 旧链接返回一条，验证全量重建
        KnowledgeLink oldLink = KnowledgeLink.builder()
            .sourceEntryId(sourceId).targetEntryId(UUID.randomUUID())
            .relation(KnowledgeLink.RelationType.RELATED).build();
        when(knowledgeLinkRepository.findAllBySourceEntryIdAndRelation(sourceId, KnowledgeLink.RelationType.RELATED))
            .thenReturn(List.of(oldLink));

        service.syncLinks(userId, sourceId);

        verify(knowledgeLinkRepository).deleteAllInBatch(List.of(oldLink));
        ArgumentCaptor<KnowledgeLink> captor = ArgumentCaptor.forClass(KnowledgeLink.class);
        verify(knowledgeLinkRepository).save(captor.capture());
        assertEquals(sourceId, captor.getValue().getSourceEntryId());
        assertEquals(targetId, captor.getValue().getTargetEntryId());
        assertEquals(KnowledgeLink.RelationType.RELATED, captor.getValue().getRelation());
    }

    @Test
    void keepsPlainTextWhenTitleNotMatched() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();

        KnowledgeEntry source = entry(sourceId, userId, "来源", "参见 [[不存在的文章]]。", UUID.randomUUID());
        when(knowledgeRepository.findByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        when(knowledgeRepository.findAllByUserIdAndTitleIgnoreCaseAndDeletedAtIsNull(userId, "不存在的文章"))
            .thenReturn(List.of());
        when(knowledgeLinkRepository.findAllBySourceEntryIdAndRelation(sourceId, KnowledgeLink.RelationType.RELATED))
            .thenReturn(List.of());

        service.syncLinks(userId, sourceId);

        verify(knowledgeLinkRepository, never()).save(any(KnowledgeLink.class));
    }

    @Test
    void prefersSameKbAndEarliestCreatedOnAmbiguity() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID kbId = UUID.randomUUID();

        KnowledgeEntry source = entry(sourceId, userId, "来源", "见 [[歧义标题]]", kbId);

        UUID otherKbTargetId = UUID.randomUUID();
        UUID sameKbOldId = UUID.randomUUID();
        UUID sameKbNewId = UUID.randomUUID();

        KnowledgeEntry otherKb = entry(otherKbTargetId, userId, "歧义标题", "x", UUID.randomUUID());
        KnowledgeEntry sameKbOld = entry(sameKbOldId, userId, "歧义标题", "x", kbId);
        KnowledgeEntry sameKbNew = entry(sameKbNewId, userId, "歧义标题", "x", kbId);
        sameKbOld.setCreatedAt(LocalDateTime.now().minusDays(10));
        sameKbNew.setCreatedAt(LocalDateTime.now().minusDays(1));

        when(knowledgeRepository.findByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        when(knowledgeRepository.findAllByUserIdAndTitleIgnoreCaseAndDeletedAtIsNull(userId, "歧义标题"))
            .thenReturn(List.of(otherKb, sameKbNew, sameKbOld));
        when(knowledgeLinkRepository.findAllBySourceEntryIdAndRelation(sourceId, KnowledgeLink.RelationType.RELATED))
            .thenReturn(List.of());

        service.syncLinks(userId, sourceId);

        ArgumentCaptor<KnowledgeLink> captor = ArgumentCaptor.forClass(KnowledgeLink.class);
        verify(knowledgeLinkRepository).save(captor.capture());
        assertEquals(sameKbOldId, captor.getValue().getTargetEntryId());
    }

    @Test
    void neverLinksToItself() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID kbId = UUID.randomUUID();

        KnowledgeEntry source = entry(sourceId, userId, "自引", "看 [[自引]] 自己", kbId);
        when(knowledgeRepository.findByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        // 只有自身命中
        when(knowledgeRepository.findAllByUserIdAndTitleIgnoreCaseAndDeletedAtIsNull(userId, "自引"))
            .thenReturn(List.of(source));
        when(knowledgeLinkRepository.findAllBySourceEntryIdAndRelation(sourceId, KnowledgeLink.RelationType.RELATED))
            .thenReturn(List.of());

        service.syncLinks(userId, sourceId);

        verify(knowledgeLinkRepository, never()).save(any(KnowledgeLink.class));
    }

    @Test
    void doesNotTouchSupplementsLinksDuringRebuild() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();

        KnowledgeEntry source = entry(sourceId, userId, "来源", "无链接", UUID.randomUUID());
        when(knowledgeRepository.findByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        // 旧 RELATED 链接为空（SUPPLEMENTS 由系统管理，不经此路径）
        when(knowledgeLinkRepository.findAllBySourceEntryIdAndRelation(sourceId, KnowledgeLink.RelationType.RELATED))
            .thenReturn(List.of());

        service.syncLinks(userId, sourceId);

        verify(knowledgeLinkRepository, never()).deleteAllInBatch(anyList());
        verify(knowledgeLinkRepository, never()).save(any(KnowledgeLink.class));
    }

    @Test
    void deduplicatesRepeatedTitles() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        UUID kbId = UUID.randomUUID();

        KnowledgeEntry source = entry(sourceId, userId, "来源", "[[目标]] 和 [[目标]]", kbId);
        KnowledgeEntry target = entry(targetId, userId, "目标", "x", kbId);

        when(knowledgeRepository.findByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        when(knowledgeRepository.findAllByUserIdAndTitleIgnoreCaseAndDeletedAtIsNull(userId, "目标"))
            .thenReturn(List.of(target));
        when(knowledgeLinkRepository.findAllBySourceEntryIdAndRelation(sourceId, KnowledgeLink.RelationType.RELATED))
            .thenReturn(List.of());

        service.syncLinks(userId, sourceId);

        verify(knowledgeLinkRepository, org.mockito.Mockito.times(1)).save(any(KnowledgeLink.class));
    }
}
