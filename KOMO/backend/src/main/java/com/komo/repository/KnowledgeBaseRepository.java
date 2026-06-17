package com.komo.repository;

import com.komo.entity.KnowledgeBase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface KnowledgeBaseRepository extends JpaRepository<KnowledgeBase, UUID> {

    List<KnowledgeBase> findAllByUserIdOrderBySortOrderAscCreatedAtAsc(UUID userId);

    boolean existsByUserIdAndName(UUID userId, String name);

    List<KnowledgeBase> findAllByUserIdAndType(UUID userId, KnowledgeBase.KnowledgeBaseType type);
}
