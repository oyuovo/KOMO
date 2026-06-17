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

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * AI 提取的知识草稿。
 * 从对话中自动提取，等待用户确认后转为正式知识条目。
 */
@Entity
@Table(name = "knowledge_drafts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeDraft extends BaseEntity {

    /** 所属用户（安全过滤） */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** 来源对话 */
    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    /** 来源 AI 消息 */
    @Column(name = "message_id", nullable = false)
    private UUID messageId;

    /** 拟议标题 */
    @Column(length = 500, nullable = false)
    private String title;

    /** Markdown 格式知识内容 */
    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    /** AI 回复中对应的原文片段 */
    @Column(name = "source_quote", columnDefinition = "TEXT")
    private String sourceQuote;

    /** AI 置信度 (0-1) */
    @Column(nullable = false)
    private Double confidence;

    /** AI 提取类型：ARTICLE（新知文章）、FRAGMENT（知识碎片）、SUPPLEMENT（补充已有） */
    @Column(name = "extract_type", length = 20)
    @Enumerated(EnumType.STRING)
    private ExtractType extractType;

    /** 与知识库内已有知识的关系 */
    @Column(name = "relation_type", length = 20)
    @Enumerated(EnumType.STRING)
    private RelationType relationType;

    /** 关系详情（JSON 格式，如关联的知识条目 ID 列表） */
    @Column(name = "relation_detail", columnDefinition = "TEXT")
    private String relationDetail;

    /** 处理状态 */
    @Column(length = 20, nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private DraftStatus status = DraftStatus.PENDING;

    /** 确认后关联的正式知识条目 */
    @Column(name = "confirmed_entry_id")
    private UUID confirmedEntryId;

    /** 处理时间 */
    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    public enum ExtractType {
        /** 新知文章 — 自成体系，可独立入库 */
        ARTICLE,
        /** 知识碎片 — 简短事实/定义，暂存碎片库 */
        FRAGMENT,
        /** 补充已有 — 嵌套进已有文章 */
        SUPPLEMENT
    }

    public enum RelationType {
        /** 新知 — 知识库中未涉及 */
        NEW,
        /** 补充 — 与已有知识相关，提供更多细节 */
        SUPPLEMENTS,
        /** 存疑 — 与已有知识存在矛盾 */
        CONTRADICTS,
        /** 重复 — 与已有知识基本相同 */
        DUPLICATE
    }

    public enum DraftStatus {
        /** 待处理 */
        PENDING,
        /** 已确认入库 */
        CONFIRMED,
        /** 编辑后入库 */
        EDITED,
        /** 已驳回 */
        REJECTED,
        /** 待异步 LLM 去重处理 */
        PENDING_DEDUP,
        /** 自动驳回（去重判定为重复） */
        REJECTED_AUTO
    }
}
