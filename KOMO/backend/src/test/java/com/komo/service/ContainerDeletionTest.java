package com.komo.service;

import com.komo.dto.request.KnowledgeCreateRequest;
import com.komo.dto.request.KnowledgeUpdateRequest;
import com.komo.entity.*;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.*;
import com.komo.security.SecurityContext;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.Mockito.*;

/** Real transactions/locks; ltree is a string domain here, not an emulation of PostgreSQL operators. */
class ContainerDeletionTest {
    private final UUID user = UUID.randomUUID();
    private final ExecutorService workers = Executors.newFixedThreadPool(2);
    private SessionFactory database;
    private TransactionTemplate tx;
    private KnowledgeRepository entries;
    private KnowledgeBaseRepository bases;
    private CategoryRepository categories;
    private ConversationRepository conversations;
    private DailyRecommendationRepository recommendations;
    private KnowledgeBaseService baseService;
    private CategoryService categoryService;
    private KnowledgeService knowledge;
    private MessageRepository messages;
    private KnowledgeDraftRepository drafts;
    private KnowledgeLinkRepository links;
    private WikiLinkService wiki;
    private UUID kb;

    @BeforeEach
    void setup() {
        database = new Configuration().addAnnotatedClass(KnowledgeEntry.class)
            .addAnnotatedClass(KnowledgeBase.class).addAnnotatedClass(Category.class)
            .addAnnotatedClass(Conversation.class).addAnnotatedClass(DailyRecommendation.class)
            .addAnnotatedClass(Message.class).addAnnotatedClass(KnowledgeDraft.class).addAnnotatedClass(KnowledgeLink.class)
            .setProperty("hibernate.connection.driver_class", "org.h2.Driver")
            .setProperty("hibernate.connection.url", "jdbc:h2:mem:" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000;INIT=CREATE DOMAIN IF NOT EXISTS ltree AS VARCHAR")
            .setProperty("hibernate.hbm2ddl.auto", "create-drop").buildSessionFactory();
        tx = new TransactionTemplate(new JpaTransactionManager(database));
        var factory = new JpaRepositoryFactory(SharedEntityManagerCreator.createSharedEntityManager(database));
        entries = factory.getRepository(KnowledgeRepository.class);
        bases = factory.getRepository(KnowledgeBaseRepository.class);
        categories = factory.getRepository(CategoryRepository.class);
        conversations = factory.getRepository(ConversationRepository.class);
        recommendations = factory.getRepository(DailyRecommendationRepository.class);
        messages = factory.getRepository(MessageRepository.class);
        drafts = factory.getRepository(KnowledgeDraftRepository.class);
        links = factory.getRepository(KnowledgeLinkRepository.class);
        wiki = mock(WikiLinkService.class);
        baseService = new KnowledgeBaseService(bases, entries, categories, conversations, recommendations);
        categoryService = new CategoryService(categories, baseService, entries);
        knowledge = new KnowledgeService(entries, links,
            mock(KnowledgeRetrievalService.class), baseService, wiki, tx, categories, conversations);
        SecurityContext.setCurrentUserId(user);
        kb = tx.execute(s -> bases.saveAndFlush(KnowledgeBase.builder().userId(user).name("待删除")
            .type(KnowledgeBase.KnowledgeBaseType.USER).isDeletable(true).build()).getId());
    }

    @AfterEach
    void cleanup() throws InterruptedException {
        SecurityContext.clear();
        workers.shutdownNow();
        assertTrue(workers.awaitTermination(10, TimeUnit.SECONDS));
        if (database != null) database.close();
    }

    private Category category(String path) {
        return tx.execute(s -> categories.saveAndFlush(Category.builder().userId(user)
            .knowledgeBaseId(kb).name("分类").path(path).build()));
    }

    private KnowledgeEntry entry(UUID categoryId, boolean deleted) {
        return tx.execute(s -> entries.saveAndFlush(KnowledgeEntry.builder().userId(user)
            .knowledgeBaseId(kb).categoryId(categoryId).title("保留标题").content("保留正文").tagNames("标签")
            .deletedAt(deleted ? LocalDateTime.now() : null).build()));
    }

    private KnowledgeEntry reload(UUID id) {
        return tx.execute(s -> entries.findByIdAndUserId(id, user).orElseThrow());
    }

    private DailyRecommendation recommendation() {
        return tx.execute(s -> recommendations.saveAndFlush(DailyRecommendation.builder().userId(user)
            .suggestedKbId(kb).question("问题").dimension("gap").build()));
    }

    private void deleteBase() { tx.executeWithoutResult(s -> baseService.delete(kb)); }
    private void deleteCategory(UUID id) { tx.executeWithoutResult(s -> categoryService.delete(id)); }

    private void createArticle() {
        var req = new KnowledgeCreateRequest();
        req.setKnowledgeBaseId(kb); req.setTitle("新增"); req.setContent("正文");
        knowledge.create(req);
    }

    private UUID anotherBase(UUID owner) {
        return tx.execute(s -> bases.saveAndFlush(KnowledgeBase.builder().userId(owner).name("目标库")
            .type(KnowledgeBase.KnowledgeBaseType.USER).isDeletable(true).build()).getId());
    }

    private KnowledgeUpdateRequest migration(KnowledgeEntry article, UUID destination, UUID categoryId) {
        var req = new KnowledgeUpdateRequest();
        req.setVersion(article.getVersion()); req.setTitle("迁移后标题"); req.setContent("迁移后正文");
        req.setKnowledgeBaseId(destination); req.setCategoryId(categoryId);
        return req;
    }

    private ConversationService conversationService(ConversationRepository repository) {
        var draftService = new KnowledgeDraftService(drafts, entries, baseService, links, wiki, tx);
        return new ConversationService(repository, messages, new ConversationPersistenceService(repository, messages),
            draftService, mock(KnowledgeRetrievalService.class), baseService, entries, mock(DedupService.class),
            mock(org.springframework.amqp.rabbit.core.RabbitTemplate.class), mock(UserService.class),
            mock(org.springframework.web.client.RestTemplate.class), mock(ReadingConversationService.class), tx);
    }

    private Conversation reading(KnowledgeEntry article) {
        return tx.execute(s -> conversationService(conversations).getOrCreateReadingConversation(user, article.getId()));
    }

    private Conversation reloadConversation(UUID id) {
        return conversations.findByIdAndUserId(id, user).orElseThrow();
    }

    @Test
    void readingHistoryFollowsMigrationThenDetachesOnDeleteWithoutLosingMessages() {
        var article = entry(null, false); var reading = reading(article);
        var message = tx.execute(s -> messages.saveAndFlush(Message.builder().conversationId(reading.getId())
            .role(Message.MessageRole.USER).content("保留问答历史").build()));
        UUID destination = anotherBase(user);
        knowledge.update(article.getId(), migration(article, destination, null));
        assertEquals(destination, reloadConversation(reading.getId()).getKnowledgeBaseId());
        deleteBase(); // 旧库不再被隐藏阅读会话挡住。
        knowledge.softDelete(article.getId());
        assertNull(reloadConversation(reading.getId()).getKnowledgeBaseId());
        assertEquals(message.getId(), messages.findAllByConversationIdOrderByCreatedAtAsc(reading.getId()).getFirst().getId());
        assertTrue(conversationService(conversations).list(user).stream().anyMatch(c -> c.getId().equals(reading.getId())));
        tx.executeWithoutResult(s -> baseService.delete(destination));
    }

    @Test
    void embedAndMergeAlsoKeepReadingReferencesConsistent() {
        var fragment = entry(null, false); var reading = reading(fragment);
        UUID destination = anotherBase(user);
        var target = tx.execute(s -> entries.saveAndFlush(KnowledgeEntry.builder().userId(user)
            .knowledgeBaseId(destination).title("目标").content("原正文").build()));
        tx.executeWithoutResult(s -> knowledge.embedInto(fragment.getId(), target.getId()));
        assertEquals(destination, reloadConversation(reading.getId()).getKnowledgeBaseId());
        // 合并使用另一碎片，避免对既存 SUPPLEMENTS 重复插入。
        var second = entry(null, false); var secondReading = reading(second);
        knowledge.mergeInto(second.getId(), target.getId());
        assertNull(reloadConversation(secondReading.getId()).getKnowledgeBaseId());
    }

    @Test
    void legacyOrphanReadingDoesNotBlockDeletingAnOtherwiseEmptyBase() {
        var deleted = entry(null, true);
        var stale = tx.execute(s -> conversations.saveAndFlush(Conversation.builder().userId(user)
            .articleId(deleted.getId()).knowledgeBaseId(kb).type(Conversation.ConversationType.READING).build()));
        var foreign = tx.execute(s -> conversations.saveAndFlush(Conversation.builder().userId(UUID.randomUUID())
            .articleId(deleted.getId()).knowledgeBaseId(kb).type(Conversation.ConversationType.READING).build()));
        deleteBase();
        assertNull(reloadConversation(stale.getId()).getKnowledgeBaseId());
        assertEquals(kb, conversations.findByIdAndUserId(foreign.getId(), foreign.getUserId()).orElseThrow().getKnowledgeBaseId());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void failedArticleChangeRollsBackReadingReferenceAlongWithArticle(boolean migration) {
        var article = entry(null, false); var reading = reading(article);
        UUID destination = anotherBase(user);
        doAnswer(call -> { entries.flush(); throw new IllegalStateException("Injected sync failure"); })
            .when(wiki).syncLinks(any(), any());
        doAnswer(call -> { entries.flush(); throw new IllegalStateException("Injected delete failure"); })
            .when(wiki).deleteRelatedLinks(any());
        assertThrows(IllegalStateException.class, () -> {
            if (migration) knowledge.update(article.getId(), migration(article, destination, null));
            else knowledge.softDelete(article.getId());
        });
        assertEquals(kb, reloadConversation(reading.getId()).getKnowledgeBaseId());
        assertEquals(kb, reload(article.getId()).getKnowledgeBaseId());
        assertNull(reload(article.getId()).getDeletedAt());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void readingCreationAndArticleDeletionCannotLeaveHiddenReferences(boolean deleteFirst) throws Exception {
        var article = entry(null, false);
        Runnable create = () -> reading(article);
        Runnable remove = () -> knowledge.softDelete(article.getId());
        race(deleteFirst ? remove : create, deleteFirst ? create : remove, deleteFirst);
        assertFalse(conversations.existsByKnowledgeBaseIdAndUserId(kb, user));
        deleteBase();
    }

    @Test
    void simultaneousReadingOpenCreatesOnlyOneConversationAndHandlesUnassignedArticles() throws Exception {
        var article = entry(null, false);
        var firstId = new java.util.concurrent.atomic.AtomicReference<UUID>();
        var secondId = new java.util.concurrent.atomic.AtomicReference<UUID>();
        race(() -> firstId.set(reading(article).getId()), () -> secondId.set(reading(article).getId()), false);
        assertEquals(firstId.get(), secondId.get());
        var unassigned = tx.execute(s -> entries.saveAndFlush(KnowledgeEntry.builder().userId(user)
            .title("未分库").content("正文").build()));
        assertNull(reading(unassigned).getKnowledgeBaseId());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void readingCreationAndMigrationNeverRestoreOldBase(boolean migrateFirst) throws Exception {
        var article = entry(null, false); UUID destination = anotherBase(user);
        Runnable open = () -> reading(article);
        Runnable move = () -> knowledge.update(article.getId(), migration(article, destination, null));
        race(migrateFirst ? move : open, migrateFirst ? open : move, migrateFirst);
        assertFalse(conversations.existsByKnowledgeBaseIdAndUserId(kb, user));
        assertEquals(destination, reading(reload(article.getId())).getKnowledgeBaseId());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void batchDeleteCommitsEachConversationOnlyAfterItsOwnSuccessfulTransaction(boolean failAtCommit) {
        var good = chatWithData(user); var bad = chatWithData(user); var after = chatWithData(user);
        var foreign = chatWithData(UUID.randomUUID());
        var failing = mock(ConversationRepository.class, delegatesTo(conversations));
        doAnswer(call -> {
            Conversation conversation = call.getArgument(0);
            conversations.delete(conversation);
            if (conversation.getId().equals(bad.getId())) {
                if (failAtCommit) {
                    org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                        new org.springframework.transaction.support.TransactionSynchronization() {
                            @Override public void beforeCommit(boolean readOnly) {
                                throw new IllegalStateException("Injected commit failure");
                            }
                        });
                } else {
                    conversations.flush();
                    throw new org.springframework.dao.DataIntegrityViolationException("Injected database failure");
                }
            }
            return null;
        }).when(failing).delete(any(Conversation.class));
        tx.executeWithoutResult(s -> {
            var result = conversationService(failing).batchDelete(List.of(good.getId(), bad.getId(), after.getId(), foreign.getId()), user);
            assertEquals(2, result.getDeleted()); assertEquals(2, result.getFailed());
            s.setRollbackOnly(); // 外层回滚不影响已经独立提交的成功项。
        });
        for (var removed : List.of(good, after)) {
            assertTrue(conversations.findByIdAndUserId(removed.getId(), user).isEmpty());
            assertTrue(messages.findAllByConversationIdOrderByCreatedAtAsc(removed.getId()).isEmpty());
            assertTrue(drafts.findByConversationIdAndUserId(removed.getId(), user).isEmpty());
        }
        for (var kept : List.of(bad, foreign)) {
            assertTrue(conversations.findByIdAndUserId(kept.getId(), kept.getUserId()).isPresent());
            assertEquals(1, messages.findAllByConversationIdOrderByCreatedAtAsc(kept.getId()).size());
            assertEquals(1, drafts.findByConversationIdAndUserId(kept.getId(), kept.getUserId()).size());
        }
    }

    private Conversation chatWithData(UUID owner) {
        return tx.execute(s -> {
            var convo = conversations.saveAndFlush(Conversation.builder().userId(owner).title("普通会话").build());
            var message = messages.saveAndFlush(Message.builder().conversationId(convo.getId()).content("历史").build());
            drafts.saveAndFlush(KnowledgeDraft.builder().userId(owner).conversationId(convo.getId())
                .messageId(message.getId()).title("草稿").content("正文").confidence(0.9).build());
            return convo;
        });
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void editorMigrationSavesDestinationContentAndCategoryTogether(boolean chooseCategory) {
        var article = entry(category("root").getId(), false);
        UUID destination = anotherBase(user);
        UUID categoryId = chooseCategory ? tx.execute(s -> categories.saveAndFlush(Category.builder()
            .userId(user).knowledgeBaseId(destination).name("新分类").path("root").build()).getId()) : null;
        knowledge.update(article.getId(), migration(article, destination, categoryId));
        var saved = reload(article.getId());
        assertEquals(destination, saved.getKnowledgeBaseId()); assertEquals(categoryId, saved.getCategoryId());
        assertEquals("迁移后正文", saved.getContent()); assertEquals("迁移后标题", saved.getTitle());
        assertEquals(article.getTagNames(), saved.getTagNames());
        assertEquals(article.getVersion() + 1, saved.getVersion());
        assertEquals(0, knowledge.list(null, kb, null, 0, 20).getTotalElements());
        assertEquals(1, knowledge.list(null, destination, null, 0, 20).getTotalElements());
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
            () -> knowledge.update(article.getId(), migration(article, kb, null))).getErrorCode());
        assertEquals(destination, reload(article.getId()).getKnowledgeBaseId());
    }

    @Test
    void omittedDestinationPreservesOriginalBase() {
        var article = entry(null, false);
        knowledge.update(article.getId(), migration(article, null, null));
        assertEquals(kb, reload(article.getId()).getKnowledgeBaseId());
    }

    @Test
    void missingForeignOrMismatchedDestinationsLeaveArticleUnchanged() {
        var cat = category("root"); var article = entry(cat.getId(), false);
        for (UUID target : new UUID[]{UUID.randomUUID(), anotherBase(UUID.randomUUID())}) {
            assertThrows(BusinessException.class,
                () -> knowledge.update(article.getId(), migration(article, target, null)));
        }
        UUID destination = anotherBase(user);
        assertEquals(ErrorCode.BAD_REQUEST, assertThrows(BusinessException.class,
            () -> knowledge.update(article.getId(), migration(article, destination, cat.getId()))).getErrorCode());
        var saved = reload(article.getId());
        assertEquals(kb, saved.getKnowledgeBaseId()); assertEquals(cat.getId(), saved.getCategoryId());
        assertEquals(article.getContent(), saved.getContent()); assertEquals(article.getVersion(), saved.getVersion());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void migrationAndDestinationDeleteCannotLeaveDanglingReference(boolean deleteFirst) throws Exception {
        UUID destination = anotherBase(user);
        var article = entry(null, false);
        Runnable move = () -> knowledge.update(article.getId(), migration(article, destination, null));
        Runnable remove = () -> tx.executeWithoutResult(s -> baseService.delete(destination));
        race(deleteFirst ? remove : move, deleteFirst ? move : remove, true);
        assertEquals(deleteFirst ? kb : destination, reload(article.getId()).getKnowledgeBaseId());
        assertEquals(deleteFirst ? article.getContent() : "迁移后正文", reload(article.getId()).getContent());
    }

    @ParameterizedTest
    @ValueSource(strings = {"article", "category", "CHAT", "READING"})
    void refusesEveryKindOfNonemptyBase(String kind) {
        switch (kind) {
            case "article" -> entry(null, false);
            case "category" -> category("root");
            default -> {
                UUID articleId = kind.equals("READING") ? entry(null, false).getId() : null;
                tx.executeWithoutResult(s -> conversations.saveAndFlush(Conversation.builder()
                    .userId(user).knowledgeBaseId(kb).articleId(articleId).type(Conversation.ConversationType.valueOf(kind)).build()));
            }
        }
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class, this::deleteBase).getErrorCode());
        assertTrue(tx.<Boolean>execute(s -> bases.findByIdAndUserIdForUpdate(kb, user).isPresent()));
    }

    @Test
    void emptyBaseDetachesOnlyItsDeletedArticlesAndRecommendationHints() {
        var deleted = entry(UUID.randomUUID(), true);
        var rec = recommendation();
        var unrelated = tx.execute(s -> entries.saveAndFlush(KnowledgeEntry.builder().userId(UUID.randomUUID())
            .knowledgeBaseId(kb).title("其他用户").content("正文").deletedAt(LocalDateTime.now()).build()));
        deleteBase();
        var saved = reload(deleted.getId());
        assertNull(saved.getKnowledgeBaseId()); assertNull(saved.getCategoryId());
        assertEquals(deleted.getVersion() + 1, saved.getVersion());
        assertEquals("保留正文", saved.getContent()); assertNotNull(saved.getDeletedAt());
        tx.executeWithoutResult(s -> {
            assertTrue(bases.findByIdAndUserIdForUpdate(kb, user).isEmpty());
            assertNull(recommendations.findByIdAndUserId(rec.getId(), user).orElseThrow().getSuggestedKbId());
            assertEquals(kb, entries.findByIdAndUserId(unrelated.getId(), unrelated.getUserId()).orElseThrow().getKnowledgeBaseId());
        });
    }

    @Test
    void leafDeletionPreservesArticlesAndInvalidatesOldEditorVersion() {
        var cat = category("root");
        var active = entry(cat.getId(), false);
        var deleted = entry(cat.getId(), true);
        var other = entry(category("root").getId(), false);
        deleteCategory(cat.getId());
        for (var original : new KnowledgeEntry[]{active, deleted}) {
            var saved = reload(original.getId());
            assertNull(saved.getCategoryId()); assertEquals(kb, saved.getKnowledgeBaseId());
            assertEquals(original.getVersion() + 1, saved.getVersion());
            assertEquals(original.getContent(), saved.getContent()); assertEquals(original.getTagNames(), saved.getTagNames());
        }
        assertEquals(other.getCategoryId(), reload(other.getId()).getCategoryId());
        var stale = new KnowledgeUpdateRequest();
        stale.setVersion(active.getVersion()); stale.setTitle("旧页面"); stale.setContent("旧正文"); stale.setCategoryId(cat.getId());
        assertEquals(ErrorCode.CONFLICT,
            assertThrows(BusinessException.class, () -> knowledge.update(active.getId(), stale)).getErrorCode());
    }

    @Test
    void parentWithChildrenAndForeignOwnedContainersCannotBeDeleted() {
        var parent = category("root");
        category("root." + parent.getId().toString().replace('-', '_'));
        var article = entry(parent.getId(), false);
        assertEquals(ErrorCode.CATEGORY_HAS_CHILDREN,
            assertThrows(BusinessException.class, () -> deleteCategory(parent.getId())).getErrorCode());
        assertEquals(parent.getId(), reload(article.getId()).getCategoryId());
        SecurityContext.setCurrentUserId(UUID.randomUUID());
        assertThrows(BusinessException.class, this::deleteBase);
        assertThrows(BusinessException.class, () -> deleteCategory(parent.getId()));
    }

    @Test
    void failedCategoryDeleteRollsBackAlreadyFlushedArticleChanges() {
        var cat = category("root"); var article = entry(cat.getId(), false);
        var failing = mock(CategoryRepository.class, delegatesTo(categories));
        doAnswer(call -> {
            categories.delete(call.getArgument(0)); categories.flush();
            throw new IllegalStateException("Injected delete failure");
        }).when(failing).delete(any(Category.class));
        categoryService = new CategoryService(failing, baseService, entries);
        assertThrows(IllegalStateException.class, () -> deleteCategory(cat.getId()));
        assertEquals(cat.getId(), reload(article.getId()).getCategoryId());
        assertEquals(article.getVersion(), reload(article.getId()).getVersion());
        assertTrue(tx.<Boolean>execute(s -> categories.findByIdAndUserId(cat.getId(), user).isPresent()));
    }

    @Test
    void descendantCheckUsesFullPathSegments() {
        var parent = category("root");
        String prefix = "root." + parent.getId().toString().replace('-', '_');
        category(prefix + "extra");
        deleteCategory(parent.getId());
        var second = category("root");
        category("root." + second.getId().toString().replace('-', '_') + ".grandchild");
        assertEquals(ErrorCode.CATEGORY_HAS_CHILDREN,
            assertThrows(BusinessException.class, () -> deleteCategory(second.getId())).getErrorCode());
    }

    @Test
    void staleRecommendationStatusUpdateCannotRestoreDeletedBaseHint() throws Exception {
        var rec = recommendation();
        var loaded = new CountDownLatch(1); var release = new CountDownLatch(1);
        Future<?> update = asUser(() -> tx.executeWithoutResult(s -> {
            var stale = recommendations.findByIdAndUserId(rec.getId(), user).orElseThrow();
            loaded.countDown(); await(release);
            stale.setStatus("DISMISSED"); recommendations.save(stale);
        }));
        try {
            await(loaded); deleteBase(); release.countDown(); update.get(10, TimeUnit.SECONDS);
            tx.executeWithoutResult(s -> {
                var saved = recommendations.findByIdAndUserId(rec.getId(), user).orElseThrow();
                assertNull(saved.getSuggestedKbId()); assertEquals("DISMISSED", saved.getStatus());
            });
        } finally { release.countDown(); }
    }

    @Test
    void failedBaseDeleteRestoresReferencesAndRecommendation() {
        var article = entry(null, true); var rec = recommendation();
        var failing = mock(KnowledgeBaseRepository.class, delegatesTo(bases));
        doAnswer(call -> {
            bases.delete(call.getArgument(0)); bases.flush();
            throw new IllegalStateException("Injected delete failure");
        }).when(failing).delete(any(KnowledgeBase.class));
        baseService = new KnowledgeBaseService(failing, entries, categories, conversations, recommendations);
        assertThrows(IllegalStateException.class, this::deleteBase);
        assertEquals(kb, reload(article.getId()).getKnowledgeBaseId());
        assertEquals(article.getVersion(), reload(article.getId()).getVersion());
        tx.executeWithoutResult(s -> {
            assertTrue(bases.findByIdAndUserIdForUpdate(kb, user).isPresent());
            assertEquals(kb, recommendations.findByIdAndUserId(rec.getId(), user).orElseThrow().getSuggestedKbId());
        });
    }

    private Future<?> asUser(Runnable action) {
        return workers.submit(() -> {
            SecurityContext.setCurrentUserId(user);
            try { action.run(); } finally { SecurityContext.clear(); }
        });
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test transaction timed out");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Test interrupted", e);
        }
    }

    private void race(Runnable firstAction, Runnable secondAction, boolean secondFails) throws Exception {
        var written = new CountDownLatch(1); var release = new CountDownLatch(1); var started = new CountDownLatch(1);
        Future<?> first = asUser(() -> tx.executeWithoutResult(s -> {
            firstAction.run(); entries.flush(); written.countDown(); await(release);
        }));
        try {
            await(written);
            Future<?> second = asUser(() -> { started.countDown(); secondAction.run(); });
            await(started);
            assertThrows(TimeoutException.class, () -> second.get(250, TimeUnit.MILLISECONDS));
            release.countDown(); first.get(10, TimeUnit.SECONDS);
            if (secondFails) {
                var error = assertThrows(ExecutionException.class, () -> second.get(10, TimeUnit.SECONDS));
                assertInstanceOf(BusinessException.class, error.getCause());
            } else second.get(10, TimeUnit.SECONDS);
        } finally { release.countDown(); }
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void baseDeleteAndArticleCreateCannotLeaveDanglingReference(boolean deleteFirst) throws Exception {
        race(deleteFirst ? this::deleteBase : this::createArticle,
            deleteFirst ? this::createArticle : this::deleteBase, true);
        assertEquals(!deleteFirst, tx.execute(s -> bases.findByIdAndUserIdForUpdate(kb, user).isPresent()));
        assertEquals(deleteFirst ? 0 : 1, entries.findAllByUserIdAndDeletedAtIsNull(user).size());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void categoryDeleteAndArticleMoveCannotLeaveDanglingReference(boolean deleteFirst) throws Exception {
        var cat = category("root"); var article = entry(null, false);
        Runnable remove = () -> deleteCategory(cat.getId());
        Runnable move = () -> knowledge.moveToCategory(article.getId(), cat.getId());
        race(deleteFirst ? remove : move, deleteFirst ? move : remove, deleteFirst);
        assertNull(reload(article.getId()).getCategoryId());
        assertTrue(tx.<Boolean>execute(s -> categories.findByIdAndUserId(cat.getId(), user).isEmpty()));
    }
}
