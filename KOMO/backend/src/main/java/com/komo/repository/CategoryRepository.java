package com.komo.repository;

import com.komo.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findAllByUserIdAndKnowledgeBaseIdOrderBySortOrder(UUID userId, UUID knowledgeBaseId);

    Optional<Category> findByIdAndUserId(UUID id, UUID userId);

    /** 查询某路径下的所有子分类（ltree 操作符 <@） */
    @Query(value = "SELECT * FROM categories WHERE user_id = :userId AND path <@ CAST(:path AS ltree)",
           nativeQuery = true)
    List<Category> findDescendants(@Param("userId") UUID userId, @Param("path") String path);

    /** 统计子分类数量 */
    long countByPathStartingWithAndUserId(String pathPrefix, UUID userId);
}
