package com.komo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.ColumnTransformer;

import java.util.UUID;

/**
 * 分类实体。
 * 对应 categories 表，使用 PostgreSQL ltree 扩展实现树形结构。
 * path 字段存储 ltree 路径，如 "root.science.physics"。
 */
@Entity
@Table(name = "categories", indexes = {
    @Index(name = "idx_categories_user_id", columnList = "user_id"),
    @Index(name = "idx_categories_path", columnList = "path")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Category extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 200)
    private String name;

    /** ltree 路径，如 "root.science.physics" */
    @Column(columnDefinition = "ltree")
    @ColumnTransformer(write = "?::ltree")
    private String path;

    @Column(name = "sort_order")
    @Builder.Default
    private Integer sortOrder = 0;
}
