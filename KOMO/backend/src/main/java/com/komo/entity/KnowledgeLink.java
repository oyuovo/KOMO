package com.komo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * 知识关联实体。
 * 对应 knowledge_links 表，自引用多对多关系。
 * 源条目和目标条目必须属于同一用户（业务层校验）。
 */
@Entity
@Table(name = "knowledge_links", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"source_entry_id", "target_entry_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeLink extends BaseEntity {

    @Column(name = "source_entry_id", nullable = false)
    private UUID sourceEntryId;

    @Column(name = "target_entry_id", nullable = false)
    private UUID targetEntryId;

    @Column(length = 20)
    @Enumerated(EnumType.STRING)
    private RelationType relation;

    /** 知识关联类型 */
    public enum RelationType {
        RELATED, EXTENDS, CONTRADICTS, SUPPLEMENTS
    }
}
