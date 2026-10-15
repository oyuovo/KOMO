package com.komo.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

/** 编辑草稿并确认入库的请求。 */
@Data
public class DraftEditRequest {

    private UUID knowledgeBaseId;

    /** 关联目标文章（可选）；服务端校验归属与有效状态。 */
    private UUID parentEntryId;

    @NotBlank(message = "标题不能为空")
    @Size(max = 500, message = "标题最长500字符")
    private String title;

    @NotBlank(message = "内容不能为空")
    @Size(max = 2_000_000, message = "内容不能超过2MB")
    private String content;
}
