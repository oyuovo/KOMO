package com.komo.repository;

import com.komo.entity.KnowledgeEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
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

    interface Location { UUID getKnowledgeBaseId(); }

    @Query("SELECT k.id AS id, k.knowledgeBaseId AS knowledgeBaseId FROM KnowledgeEntry k WHERE k.id = :id AND k.userId = :userId AND k.deletedAt IS NULL")
    Optional<Location> findLocationByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT k FROM KnowledgeEntry k WHERE k.id = :id AND k.userId = :userId")
    Optional<KnowledgeEntry> findByIdAndUserIdForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);

    boolean existsByKnowledgeBaseIdAndUserIdAndDeletedAtIsNull(UUID knowledgeBaseId, UUID userId);

    /** 分类删除后解除归属，并使旧编辑页面的版本失效。包含软删文章。 */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE KnowledgeEntry k SET k.categoryId = NULL, k.version = coalesce(k.version, 0) + 1, "
         + "k.updatedAt = CURRENT_TIMESTAMP WHERE k.categoryId = :categoryId AND k.userId = :userId")
    int clearCategoryByCategoryIdAndUserId(@Param("categoryId") UUID categoryId, @Param("userId") UUID userId);

    /** 空库删除时清理仅存于软删记录中的引用，不恢复或删除文章正文。 */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE KnowledgeEntry k SET k.knowledgeBaseId = NULL, k.categoryId = NULL, "
         + "k.version = coalesce(k.version, 0) + 1, k.updatedAt = CURRENT_TIMESTAMP "
         + "WHERE k.knowledgeBaseId = :knowledgeBaseId AND k.userId = :userId AND k.deletedAt IS NOT NULL")
    int detachDeletedByKnowledgeBaseIdAndUserId(@Param("knowledgeBaseId") UUID knowledgeBaseId, @Param("userId") UUID userId);

    /** 分页列表（排除已删除），支持分类、知识库、关键词过滤 */
    @Query("SELECT k FROM KnowledgeEntry k WHERE k.userId = :userId AND k.deletedAt IS NULL "
         + "AND (:categoryId IS NULL OR k.categoryId = :categoryId) "
         + "AND (:knowledgeBaseId IS NULL OR k.knowledgeBaseId = :knowledgeBaseId) "
         + "AND (:query IS NULL OR lower(k.contentPlain) LIKE lower(concat('%', cast(:query as text), '%'))) "
         + "ORDER BY k.updatedAt DESC")
    Page<KnowledgeEntry> findByUserIdAndFilters(
        @Param("userId") UUID userId,
        @Param("categoryId") UUID categoryId,
        @Param("knowledgeBaseId") UUID knowledgeBaseId,
        @Param("query") String query,
        Pageable pageable
    );

    /** 批量归属校验 — 用于知识关联两端验证 */
    @Query("SELECT k FROM KnowledgeEntry k WHERE k.id IN (:ids) AND k.userId = :userId")
    List<KnowledgeEntry> findAllByIdsAndUserId(@Param("ids") List<UUID> ids, @Param("userId") UUID userId);

    /** 查询当前用户所有未删除条目（用于导出） */
    List<KnowledgeEntry> findAllByUserIdAndDeletedAtIsNull(UUID userId);

    /** 按标题精确匹配（忽略大小写，排除已删除）— 用于 [[wiki 链接]] 标题解析 */
    List<KnowledgeEntry> findAllByUserIdAndTitleIgnoreCaseAndDeletedAtIsNull(UUID userId, String title);
}
