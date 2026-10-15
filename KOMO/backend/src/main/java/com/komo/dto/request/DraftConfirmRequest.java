package com.komo.dto.request;

import lombok.Data;

import java.util.UUID;

/** 草稿确认/编辑请求 DTO */
@Data
public class DraftConfirmRequest {

    /** 覆盖默认知识库（可选） */
    private UUID knowledgeBaseId;

    /** 关联目标文章（可选）；确认不会修改其正文。 */
    private UUID parentEntryId;

}
