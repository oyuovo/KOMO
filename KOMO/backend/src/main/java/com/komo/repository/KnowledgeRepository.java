package com.komo.repository;

import com.komo.entity.KnowledgeEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 知识条目的数据访问层。
 * 所有查询方法强制携带 userId，确保水平越权防护。
 * 禁止直接使用 JpaRepository 的裸 findById 方法。
 */
public interface KnowledgeRepository extends JpaRepository<KnowledgeEntry, UUID> {

    /** 单条查询：必须带 userId — 这是安全基线 */
    Optional<KnowledgeEntry> findByIdAndUserId(UUID id, UUID userId);

    /** 分页列表（排除已删除），支持分类和关键词过滤 */
    @Query("SELECT k FROM KnowledgeEntry k WHERE k.userId = :userId AND k.deletedAt IS NULL "
         + "AND (:categoryId IS NULL OR k.categoryId = :categoryId) "
         + "AND (:query IS NULL OR lower(k.contentPlain) LIKE lower(concat('%', cast(:query as text), '%'))) "
         + "ORDER BY k.updatedAt DESC")
    Page<KnowledgeEntry> findByUserIdAndFilters(
        @Param("userId") UUID userId,
        @Param("categoryId") UUID categoryId,
        @Param("query") String query,
        Pageable pageable
    );

    /** 批量归属校验 — 用于知识关联两端验证 */
    @Query("SELECT k FROM KnowledgeEntry k WHERE k.id IN (:ids) AND k.userId = :userId")
    List<KnowledgeEntry> findAllByIdsAndUserId(@Param("ids") List<UUID> ids, @Param("userId") UUID userId);

    /** 用于知识导出 */
    List<KnowledgeEntry> findAllByUserIdAndDeletedAtIsNull(UUID userId);
}
