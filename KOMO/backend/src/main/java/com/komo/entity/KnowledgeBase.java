package com.komo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * 知识库实体。
 * 用户可创建多个知识库来组织知识。系统自动创建两个：
 * - 默认知识库（DEFAULT）：用户主要的知识容器
 * - 知识碎片库（SYSTEM_FRAGMENTS）：不可删除，用于暂存碎片化知识
 */
@Entity
@Table(name = "knowledge_bases")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeBase extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 20, nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private KnowledgeBaseType type = KnowledgeBaseType.USER;

    @Column(name = "is_deletable", nullable = false)
    @Builder.Default
    private boolean isDeletable = true;

    @Column(name = "sort_order")
    @Builder.Default
    private int sortOrder = 0;

    public enum KnowledgeBaseType {
        /** 系统知识碎片库 — 不可删除，每个用户一个 */
        SYSTEM_FRAGMENTS,
        /** 默认知识库 — 注册时创建 */
        DEFAULT,
        /** 用户自定义知识库 */
        USER
    }
}
