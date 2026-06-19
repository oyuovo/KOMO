package com.komo.dto.request;

import lombok.Data;

import java.util.UUID;

/** 草稿确认/编辑请求 DTO */
@Data
public class DraftConfirmRequest {

    /** 覆盖默认知识库（可选） */
    private UUID knowledgeBaseId;

    /** 嵌入目标文章（可选） */
    private UUID parentEntryId;

}
