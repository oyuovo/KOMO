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

@Entity
@Table(name = "conversations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Conversation extends BaseEntity {

    /** 对话类型：普通对话 / 文章侧边栏阅读问答 */
    public enum ConversationType {
        CHAT, READING
    }

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(length = 500)
    private String title;

    @Column(name = "knowledge_base_id")
    private UUID knowledgeBaseId;  // null = 无知识库对话，不提取知识

    /** 对话类型。历史行可能为 NULL，业务层视为 CHAT。 */
    @Column(length = 20)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ConversationType type = ConversationType.CHAT;

    /** READING 类型对话关联的文章 ID（阅读问答场景） */
    @Column(name = "article_id")
    private UUID articleId;
}
