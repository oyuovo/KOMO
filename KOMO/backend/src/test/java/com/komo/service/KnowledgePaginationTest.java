package com.komo.service;

import com.komo.entity.KnowledgeEntry;
import com.komo.repository.KnowledgeRepository;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class KnowledgePaginationTest {
    @Test
    void equalTimestampsHaveStablePageBoundariesAndRespectOwnerAndBase() {
        try (var database = new Configuration().addAnnotatedClass(KnowledgeEntry.class)
                .setProperty("hibernate.connection.driver_class", "org.h2.Driver")
                .setProperty("hibernate.connection.url", "jdbc:h2:mem:" + UUID.randomUUID())
                .setProperty("hibernate.hbm2ddl.auto", "create-drop").buildSessionFactory()) {
            var tx = new TransactionTemplate(new JpaTransactionManager(database));
            var em = SharedEntityManagerCreator.createSharedEntityManager(database);
            var entries = new JpaRepositoryFactory(em).getRepository(KnowledgeRepository.class);
            UUID user = UUID.randomUUID(), kb = UUID.randomUUID();
            var expected = new ArrayList<String>();
            tx.executeWithoutResult(status -> {
                for (int i = 0; i < 9; i++) {
                    var entry = KnowledgeEntry.builder()
                        .userId(i == 6 ? UUID.randomUUID() : user)
                        .knowledgeBaseId(i == 7 ? UUID.randomUUID() : kb)
                        .title("Article " + i).content("body").contentPlain("body").build();
                    if (i == 8) entry.setDeletedAt(LocalDateTime.now());
                    entries.saveAndFlush(entry);
                    if (i < 6) expected.add(entry.getId().toString());
                }
                em.createQuery("UPDATE KnowledgeEntry k SET k.updatedAt = :time")
                    .setParameter("time", LocalDateTime.of(2026, 1, 1, 0, 0)).executeUpdate();
                em.clear();
            });
            expected.sort(Comparator.reverseOrder());
            var actual = new ArrayList<String>();
            for (int page = 0; page < 3; page++) {
                int pageNumber = page;
                var result = tx.execute(status -> entries.findByUserIdAndFilters(
                    user, null, kb, null, PageRequest.of(pageNumber, 2)));
                assertEquals(6, result.getTotalElements());
                assertEquals(3, result.getTotalPages());
                result.forEach(entry -> actual.add(entry.getId().toString()));
            }
            assertEquals(expected, actual);
        }
    }
}
