package com.komo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 知识条目实体。
 * 对应 knowledge_entries 表，存储用户的知识内容。
 * 支持软删除、来源追踪、分类归属、标签关联。
 */
@Entity
@Table(name = "knowledge_entries", indexes = {
    @Index(name = "idx_knowledge_user_id", columnList = "user_id"),
    @Index(name = "idx_knowledge_category_id", columnList = "category_id"),
    @Index(name = "idx_knowledge_deleted_at", columnList = "deleted_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeEntry extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(name = "content_plain", columnDefinition = "TEXT")
    private String contentPlain;

    @Column(length = 20)
    @Enumerated(EnumType.STRING)
    private KnowledgeSource source;

    @Column(name = "entry_type", length = 20)
    @Enumerated(EnumType.STRING)
    private KnowledgeType entryType;

    @Column(length = 20)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private EntryStatus status = EntryStatus.PUBLISHED;

    @Column(name = "category_id")
    private UUID categoryId;

    /** 所属知识库 ID */
    @Column(name = "knowledge_base_id")
    private UUID knowledgeBaseId;

    /** 标签（逗号分隔，简单存储） */
    @Column(name = "tag_names", length = 500)
    private String tagNames;

    @Column(name = "embedding_id")
    private UUID embeddingId;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Version
    private Long version;

    /** 知识来源 */
    public enum KnowledgeSource {
        MANUAL, AI_EXTRACT, IMPORT
    }

    /** 知识类型 */
    public enum KnowledgeType {
        FACT, CONCEPT, INSIGHT, METHOD, QUESTION
    }

    /** 条目状态 */
    public enum EntryStatus {
        DRAFT, PUBLISHED, ARCHIVED
    }
}
