package com.komo.repository;

import com.komo.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findAllByUserIdAndKnowledgeBaseIdOrderBySortOrder(UUID userId, UUID knowledgeBaseId);

    Optional<Category> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Category c WHERE c.id = :id AND c.userId = :userId")
    Optional<Category> findByIdAndUserIdForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);

    boolean existsByKnowledgeBaseIdAndUserId(UUID knowledgeBaseId, UUID userId);

    /** 查询某路径下的所有子分类（ltree 操作符 <@） */
    @Query(value = "SELECT * FROM categories WHERE user_id = :userId AND knowledge_base_id = :knowledgeBaseId AND path <@ CAST(:path AS ltree)",
           nativeQuery = true)
    List<Category> findDescendants(@Param("userId") UUID userId, @Param("knowledgeBaseId") UUID knowledgeBaseId, @Param("path") String path);

    /** ltree 先转为字符串再比较路径边界，避免直接 LIKE 和 UUID 中下划线的通配歧义。 */
    @Query("SELECT count(c) FROM Category c WHERE c.userId = :userId AND c.knowledgeBaseId = :knowledgeBaseId "
         + "AND (cast(c.path as string) = :pathPrefix "
         + "OR substring(cast(c.path as string), 1, length(:pathPrefix) + 1) = concat(:pathPrefix, '.'))")
    long countDescendantsByUserIdAndKnowledgeBaseId(@Param("pathPrefix") String pathPrefix,
        @Param("userId") UUID userId, @Param("knowledgeBaseId") UUID knowledgeBaseId);
}
