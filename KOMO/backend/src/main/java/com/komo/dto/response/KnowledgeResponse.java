package com.komo.dto.response;

import com.komo.entity.KnowledgeEntry;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 知识条目响应 DTO。
 * 将实体转为前端需要的格式（枚举值转字符串等）。
 */
@Data
@Builder
public class KnowledgeResponse {
    private UUID id;
    private String title;
    private String content;
    private String source;
    private String entryType;
    private String status;
    private UUID categoryId;
    private String categoryName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static KnowledgeResponse from(KnowledgeEntry entry) {
        return KnowledgeResponse.builder()
            .id(entry.getId())
            .title(entry.getTitle())
            .content(entry.getContent())
            .source(entry.getSource() != null ? entry.getSource().name() : null)
            .entryType(entry.getEntryType() != null ? entry.getEntryType().name() : null)
            .status(entry.getStatus() != null ? entry.getStatus().name() : null)
            .categoryId(entry.getCategoryId())
            .createdAt(entry.getCreatedAt())
            .updatedAt(entry.getUpdatedAt())
            .build();
    }
}
