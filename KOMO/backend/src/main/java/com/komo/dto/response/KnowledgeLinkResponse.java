package com.komo.dto.response;

import com.komo.entity.KnowledgeLink;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 知识关联响应 DTO。
 * 在实体字段之上补充两端标题，前端据 sourceEntryId 是否等于当前文章判断方向
 * （出链 outgoing / 入链 incoming）。
 */
@Data
@Builder
public class KnowledgeLinkResponse {
    private UUID id;
    private UUID sourceEntryId;
    private UUID targetEntryId;
    private String relation;
    private String sourceTitle;
    private String targetTitle;
    private LocalDateTime createdAt;

    public static KnowledgeLinkResponse from(KnowledgeLink link, String sourceTitle, String targetTitle) {
        return KnowledgeLinkResponse.builder()
            .id(link.getId())
            .sourceEntryId(link.getSourceEntryId())
            .targetEntryId(link.getTargetEntryId())
            .relation(link.getRelation() != null ? link.getRelation().name() : null)
            .sourceTitle(sourceTitle)
            .targetTitle(targetTitle)
            .createdAt(link.getCreatedAt())
            .build();
    }
}
