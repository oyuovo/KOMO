package com.komo.service;

import com.komo.entity.KnowledgeDraft;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeLink;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
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
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Real JPA transactions and row locks, using a disposable in-memory database only. */
class KnowledgeDraftConcurrencyTest {
    private final UUID user = UUID.randomUUID();
    private final UUID kb = UUID.randomUUID();
    private SessionFactory database;
    private TransactionTemplate tx;
    private KnowledgeDraftRepository drafts;
    private KnowledgeRepository entries;
    private KnowledgeDraftService service;
    private UUID draftId;
    private final ExecutorService workers = Executors.newFixedThreadPool(2);

    @BeforeEach
    void setup() {
        database = new Configuration()
            .addAnnotatedClass(KnowledgeDraft.class)
            .addAnnotatedClass(KnowledgeEntry.class)
            .addAnnotatedClass(KnowledgeLink.class)
            .setProperty("hibernate.connection.driver_class", "org.h2.Driver")
            .setProperty("hibernate.connection.url", "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000")
            .setProperty("hibernate.hbm2ddl.auto", "create-drop")
            .buildSessionFactory();
        tx = new TransactionTemplate(new JpaTransactionManager(database));
        var factory = new JpaRepositoryFactory(SharedEntityManagerCreator.createSharedEntityManager(database));
        drafts = factory.getRepository(KnowledgeDraftRepository.class);
        entries = factory.getRepository(KnowledgeRepository.class);
        service = new KnowledgeDraftService(drafts, entries, mock(KnowledgeBaseService.class),
            factory.getRepository(KnowledgeLinkRepository.class), mock(WikiLinkService.class), tx);
        draftId = tx.execute(status -> drafts.saveAndFlush(KnowledgeDraft.builder().userId(user)
            .conversationId(UUID.randomUUID()).messageId(UUID.randomUUID())
            .title("待确认").content("正文").confidence(0.9).build()).getId());
    }

    @AfterEach
    void cleanup() throws InterruptedException {
        workers.shutdownNow();
        assertTrue(workers.awaitTermination(10, TimeUnit.SECONDS));
        if (database != null) database.close();
    }

    private void process(String action) {
        switch (action) {
            case "confirm" -> service.confirm(draftId, kb);
            case "edit" -> service.editAndConfirm(draftId, "编辑标题", "编辑正文", kb);
            case "reject" -> service.reject(draftId);
            default -> throw new IllegalArgumentException(action);
        }
    }

    private Future<?> asUser(Runnable action) {
        return workers.submit(() -> {
            SecurityContext.setCurrentUserId(user);
            try { action.run(); }
            finally { SecurityContext.clear(); }
        });
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting for test transaction");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted test transaction", e);
        }
    }

    @ParameterizedTest
    @CsvSource({"confirm,confirm", "confirm,edit", "confirm,reject", "reject,confirm"})
    void competingTransitionsWaitAndOnlyOneWins(String firstAction, String secondAction) throws Exception {
        CountDownLatch written = new CountDownLatch(1), release = new CountDownLatch(1), started = new CountDownLatch(1);
        Future<?> first = asUser(() -> tx.executeWithoutResult(status -> {
            process(firstAction);
            written.countDown();
            await(release);
        }));
        try {
            await(written);
            Future<?> second = asUser(() -> { started.countDown(); process(secondAction); });
            await(started);
            // The second transaction must wait, rather than observe PENDING and insert another entry.
            assertThrows(TimeoutException.class, () -> second.get(250, TimeUnit.MILLISECONDS));
            release.countDown();
            first.get(10, TimeUnit.SECONDS);
            ExecutionException error = assertThrows(ExecutionException.class, () -> second.get(10, TimeUnit.SECONDS));
            assertInstanceOf(BusinessException.class, error.getCause());
            assertEquals(ErrorCode.DRAFT_ALREADY_PROCESSED, ((BusinessException) error.getCause()).getErrorCode());
            tx.executeWithoutResult(status -> {
                var saved = drafts.findByIdAndUserId(draftId, user).orElseThrow();
                var created = entries.findAllByUserIdAndDeletedAtIsNull(user);
                assertEquals(firstAction.equals("reject") ? 0 : 1, created.size());
                assertEquals(firstAction.equals("reject") ? KnowledgeDraft.DraftStatus.REJECTED
                    : KnowledgeDraft.DraftStatus.CONFIRMED, saved.getStatus());
                if (!created.isEmpty()) assertEquals(created.getFirst().getId(), saved.getConfirmedEntryId());
            });
        } finally { release.countDown(); }
    }

    @Test
    void rolledBackConfirmationLeavesDraftAvailableForWaitingRequest() throws Exception {
        CountDownLatch written = new CountDownLatch(1), release = new CountDownLatch(1), started = new CountDownLatch(1);
        Future<?> first = asUser(() -> tx.executeWithoutResult(status -> {
            process("confirm");
            written.countDown();
            await(release);
            status.setRollbackOnly();
        }));
        try {
            await(written);
            Future<?> second = asUser(() -> { started.countDown(); process("confirm"); });
            await(started);
            assertThrows(TimeoutException.class, () -> second.get(250, TimeUnit.MILLISECONDS));
            release.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
            tx.executeWithoutResult(status -> {
                var created = entries.findAllByUserIdAndDeletedAtIsNull(user);
                assertEquals(1, created.size());
                assertEquals(created.getFirst().getId(), drafts.findByIdAndUserId(draftId, user).orElseThrow().getConfirmedEntryId());
            });
        } finally { release.countDown(); }
    }
}
