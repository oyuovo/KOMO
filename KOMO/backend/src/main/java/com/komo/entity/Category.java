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

@Entity
@Table(name = "categories", indexes = {
    @Index(name = "idx_categories_user_id", columnList = "user_id"),
    @Index(name = "idx_categories_kb_id", columnList = "knowledge_base_id"),
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

    @Column(name = "knowledge_base_id", nullable = false)
    private UUID knowledgeBaseId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(columnDefinition = "ltree")
    @ColumnTransformer(write = "?::ltree")
    private String path;

    @Column(name = "sort_order")
    @Builder.Default
    private Integer sortOrder = 0;
}
