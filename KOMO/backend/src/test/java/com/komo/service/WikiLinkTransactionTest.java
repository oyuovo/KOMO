package com.komo.service;

import com.komo.dto.request.KnowledgeCreateRequest;
import com.komo.dto.request.KnowledgeUpdateRequest;
import com.komo.entity.KnowledgeDraft;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeLink;
import com.komo.repository.CategoryRepository;
import com.komo.repository.KnowledgeDraftRepository;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Tests real writes/unique constraints and rollback in an isolated in-memory database. */
class WikiLinkTransactionTest {
    private final UUID user = UUID.randomUUID(), kb = UUID.randomUUID();
    private SessionFactory database;
    private TransactionTemplate tx;
    private KnowledgeRepository entries;
    private KnowledgeLinkRepository links;
    private KnowledgeDraftRepository drafts;
    private KnowledgeService knowledge;
    private KnowledgeDraftService confirmation;
    private WikiLinkService wiki;
    private boolean failSync, failDelete;

    @BeforeEach
    void setup() {
        database = new Configuration().addAnnotatedClass(KnowledgeEntry.class)
            .addAnnotatedClass(KnowledgeLink.class).addAnnotatedClass(KnowledgeDraft.class)
            .setProperty("hibernate.connection.driver_class", "org.h2.Driver")
            .setProperty("hibernate.connection.url", "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1")
            .setProperty("hibernate.hbm2ddl.auto", "create-drop").buildSessionFactory();
        tx = new TransactionTemplate(new JpaTransactionManager(database));
        var factory = new JpaRepositoryFactory(SharedEntityManagerCreator.createSharedEntityManager(database));
        entries = factory.getRepository(KnowledgeRepository.class);
        links = factory.getRepository(KnowledgeLinkRepository.class);
        drafts = factory.getRepository(KnowledgeDraftRepository.class);
        wiki = spy(new WikiLinkService(entries, links));
        // Flush real DB changes before injecting a failure, so assertions verify rollback, not just unflushed state.
        doAnswer(call -> {
            call.callRealMethod();
            entries.flush();
            if (failSync) throw new IllegalStateException("Injected wiki sync failure");
            return null;
        }).when(wiki).syncLinks(any(), any());
        doAnswer(call -> {
            call.callRealMethod();
            entries.flush();
            if (failDelete) throw new IllegalStateException("Injected wiki cleanup failure");
            return null;
        }).when(wiki).deleteRelatedLinks(any());
        KnowledgeBaseService bases = mock(KnowledgeBaseService.class);
        knowledge = new KnowledgeService(entries, links, mock(KnowledgeRetrievalService.class),
            bases, wiki, tx, mock(CategoryRepository.class), mock(com.komo.repository.ConversationRepository.class));
        confirmation = new KnowledgeDraftService(drafts, entries, bases, links, wiki, tx);
        SecurityContext.setCurrentUserId(user);
    }

    @AfterEach
    void cleanup() {
        SecurityContext.clear();
        if (database != null) database.close();
    }

    private KnowledgeEntry create(String title, String body) {
        var req = new KnowledgeCreateRequest();
        req.setKnowledgeBaseId(kb);
        req.setTitle(title);
        req.setContent(body);
        return knowledge.create(req);
    }

    private KnowledgeUpdateRequest update(KnowledgeEntry entry, String body) {
        var req = new KnowledgeUpdateRequest();
        req.setVersion(entry.getVersion());
        req.setTitle(entry.getTitle());
        req.setContent(body);
        return req;
    }

    private List<KnowledgeLink> outgoing(UUID id) {
        return tx.execute(status -> links.findAllBySourceEntryIdAndUserId(id, user));
    }

    private KnowledgeEntry reload(UUID id) {
        return tx.execute(status -> entries.findByIdAndUserId(id, user).orElseThrow());
    }

    private KnowledgeDraft draft(String body) {
        return tx.execute(status -> drafts.saveAndFlush(KnowledgeDraft.builder().userId(user)
            .conversationId(UUID.randomUUID()).messageId(UUID.randomUUID())
            .title("草稿标题").content(body).confidence(0.9).build()));
    }

    @Test
    void confirmingSupplementWithWikiReferenceReusesTheLinkAcrossEdits() {
        KnowledgeEntry parent = create("目标文章", "原正文");
        KnowledgeDraft draft = draft("补充内容，见[[目标文章]]");
        KnowledgeEntry saved = confirmation.confirmWithParent(draft.getId(), kb, parent.getId());
        var link = outgoing(saved.getId()).getFirst();
        assertEquals(1, outgoing(saved.getId()).size());
        assertEquals(KnowledgeLink.RelationType.SUPPLEMENTS, link.getRelation());
        knowledge.update(saved.getId(), update(saved, "新正文，仍引用[[目标文章]]"));
        assertEquals(link.getId(), outgoing(saved.getId()).getFirst().getId());
        KnowledgeEntry latest = reload(saved.getId());
        knowledge.update(saved.getId(), update(latest, "删除引用但保留补充关系"));
        assertEquals(link.getId(), outgoing(saved.getId()).getFirst().getId());
        assertEquals("原正文", reload(parent.getId()).getContent());
    }

    @Test
    void unchangedWikiLinkRetainsIdentityAndOwnerFiltering() {
        create("目标", "正文");
        KnowledgeEntry source = create("来源", "[[目标]]");
        UUID linkId = outgoing(source.getId()).getFirst().getId();
        knowledge.update(source.getId(), update(source, "修改正文，保留[[目标]]"));
        assertEquals(linkId, outgoing(source.getId()).getFirst().getId());
        assertTrue(tx.execute(status -> links.findAllBySourceEntryIdAndUserId(source.getId(), UUID.randomUUID())).isEmpty());
    }

    @Test
    void createFailureRollsBackArticleAndNewWikiLinks() {
        KnowledgeEntry target = create("目标", "正文");
        failSync = true;
        assertThrows(IllegalStateException.class, () -> create("来源", "[[目标]]"));
        tx.executeWithoutResult(status -> {
            assertEquals(List.of(target.getId()), entries.findAllByUserIdAndDeletedAtIsNull(user).stream().map(KnowledgeEntry::getId).toList());
            assertTrue(links.findAllByEntryId(target.getId()).isEmpty());
        });
    }

    @Test
    void failedEditRestoresBodyVersionAndRemovedLinks() {
        create("旧目标", "正文");
        create("新目标", "正文");
        KnowledgeEntry source = create("来源", "[[旧目标]]");
        UUID oldLink = outgoing(source.getId()).getFirst().getId();
        failSync = true;
        assertThrows(IllegalStateException.class, () -> knowledge.update(source.getId(), update(source, "[[新目标]]")));
        KnowledgeEntry saved = reload(source.getId());
        assertEquals(source.getContent(), saved.getContent());
        assertEquals(source.getVersion(), saved.getVersion());
        assertEquals(List.of(oldLink), outgoing(source.getId()).stream().map(KnowledgeLink::getId).toList());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void migrationResolvesWikiInDestinationAndRollsBackTogetherOnFailure(boolean failure) {
        KnowledgeEntry oldTarget = create("同名文章", "原库正文");
        UUID destination = UUID.randomUUID();
        KnowledgeEntry newTarget = tx.execute(s -> entries.saveAndFlush(KnowledgeEntry.builder()
            .userId(user).knowledgeBaseId(destination).title("同名文章").content("目标库正文").build()));
        KnowledgeEntry source = create("待迁移", "[[同名文章]]");
        assertEquals(oldTarget.getId(), outgoing(source.getId()).getFirst().getTargetEntryId());
        var req = update(source, "修改正文 [[同名文章]]"); req.setKnowledgeBaseId(destination);
        failSync = failure;
        if (failure) assertThrows(IllegalStateException.class, () -> knowledge.update(source.getId(), req));
        else knowledge.update(source.getId(), req);
        var saved = reload(source.getId());
        assertEquals(failure ? kb : destination, saved.getKnowledgeBaseId());
        assertEquals(failure ? source.getContent() : req.getContent(), saved.getContent());
        assertEquals(failure ? source.getVersion() : source.getVersion() + 1, saved.getVersion());
        assertEquals(failure ? oldTarget.getId() : newTarget.getId(), outgoing(source.getId()).getFirst().getTargetEntryId());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void failedConfirmationRestoresPendingDraftAndCanBeRetried(boolean edited) {
        KnowledgeEntry parent = create("目标", "正文");
        KnowledgeDraft original = draft("原草稿正文");
        failSync = true;
        assertThrows(IllegalStateException.class, () -> {
            if (edited) confirmation.editAndConfirm(original.getId(), "编辑标题", "[[目标]]", kb, parent.getId());
            else confirmation.confirmWithParent(original.getId(), kb, parent.getId());
        });
        tx.executeWithoutResult(status -> {
            KnowledgeDraft saved = drafts.findByIdAndUserId(original.getId(), user).orElseThrow();
            assertEquals(KnowledgeDraft.DraftStatus.PENDING, saved.getStatus());
            assertEquals(original.getTitle(), saved.getTitle());
            assertEquals(original.getContent(), saved.getContent());
            assertNull(saved.getConfirmedEntryId());
            assertNull(saved.getProcessedAt());
            assertEquals(1, entries.findAllByUserIdAndDeletedAtIsNull(user).size());
            assertTrue(links.findAllByEntryId(parent.getId()).isEmpty());
        });
        failSync = false;
        confirmation.confirmWithParent(original.getId(), kb, parent.getId());
        int entryCount = tx.execute(status -> entries.findAllByUserIdAndDeletedAtIsNull(user).size());
        assertEquals(2, entryCount);
    }

    @Test
    void failedMergeRestoresTargetFragmentAndLinks() {
        create("引用目标", "正文");
        KnowledgeEntry target = create("合并目标", "原目标正文");
        KnowledgeEntry fragment = create("碎片", "碎片正文[[引用目标]]");
        UUID fragmentLink = outgoing(fragment.getId()).getFirst().getId();
        failSync = true;
        assertThrows(IllegalStateException.class, () -> knowledge.mergeInto(fragment.getId(), target.getId()));
        assertEquals(target.getContent(), reload(target.getId()).getContent());
        assertEquals(target.getVersion(), reload(target.getId()).getVersion());
        assertNull(reload(fragment.getId()).getDeletedAt());
        assertTrue(outgoing(target.getId()).isEmpty());
        assertEquals(List.of(fragmentLink), outgoing(fragment.getId()).stream().map(KnowledgeLink::getId).toList());
    }

    @Test
    void failedDeleteRestoresArticleAndBothDirectionsOfWikiLinks() {
        create("引用目标", "正文");
        KnowledgeEntry target = create("目标", "正文[[引用目标]]");
        KnowledgeEntry source = create("来源", "[[目标]]");
        UUID linkId = outgoing(source.getId()).getFirst().getId();
        UUID targetLinkId = outgoing(target.getId()).getFirst().getId();
        failDelete = true;
        assertThrows(IllegalStateException.class, () -> knowledge.softDelete(target.getId()));
        assertNull(reload(target.getId()).getDeletedAt());
        assertEquals(linkId, outgoing(source.getId()).getFirst().getId());
        assertEquals(targetLinkId, outgoing(target.getId()).getFirst().getId());
    }
}
