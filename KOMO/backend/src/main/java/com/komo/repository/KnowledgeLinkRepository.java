package com.komo.repository;

import com.komo.entity.KnowledgeLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface KnowledgeLinkRepository extends JpaRepository<KnowledgeLink, UUID> {

    /** 查询某条目的所有关联（它作为源或被关联） */
    @Query("SELECT l FROM KnowledgeLink l WHERE l.sourceEntryId = :entryId OR l.targetEntryId = :entryId")
    List<KnowledgeLink> findAllByEntryId(@Param("entryId") UUID entryId);

    /** 检查关联是否已存在 */
    boolean existsBySourceEntryIdAndTargetEntryId(UUID sourceEntryId, UUID targetEntryId);
}
