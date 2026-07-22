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

import java.util.UUID;

/**
 * 每日推荐问题实体。
 * AI 基于用户知识库生成自查问题，引导用户发现知识盲区。
 */
@Entity
@Table(name = "daily_recommendations", indexes = {
    @Index(name = "idx_daily_rec_user_status", columnList = "user_id, status, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DailyRecommendation extends BaseEntity {

    /** 所属用户 */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** 问题文本 */
    @Column(columnDefinition = "TEXT", nullable = false)
    private String question;

    /** 问题维度: deepening | cross_domain | gap */
    @Column(length = 20, nullable = false)
    private String dimension;

    /** 相关条目标题列表，JSON 数组 [{id, title}] */
    @Column(name = "related_knowledge_titles", columnDefinition = "TEXT")
    private String relatedKnowledgeTitles;

    /** 缺失领域描述 */
    @Column(name = "missing_area", length = 500)
    private String missingArea;

    /** 建议的知识库 ID */
    @Column(name = "suggested_kb_id")
    private UUID suggestedKbId;

    /** 状态: ACTIVE | DISMISSED | SAVED | CONVERSED */
    @Column(length = 20, nullable = false)
    @Builder.Default
    private String status = "ACTIVE";
}
