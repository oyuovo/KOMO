package com.komo.repository;

import com.komo.entity.KnowledgeBase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface KnowledgeBaseRepository extends JpaRepository<KnowledgeBase, UUID> {

    /** Serialize system-base provisioning for one user across application instances. */
    @Query(value = """
        SELECT 1
        FROM (SELECT pg_advisory_xact_lock(hashtext(CAST(:userId AS text)))) AS locked
        """, nativeQuery = true)
    Integer acquireSystemBaseLock(@Param("userId") UUID userId);

    List<KnowledgeBase> findAllByUserIdOrderBySortOrderAscCreatedAtAsc(UUID userId);

    boolean existsByUserIdAndName(UUID userId, String name);

    List<KnowledgeBase> findAllByUserIdAndType(UUID userId, KnowledgeBase.KnowledgeBaseType type);
}
