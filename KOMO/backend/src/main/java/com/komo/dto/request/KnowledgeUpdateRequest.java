package com.komo.dto.request;

import com.komo.entity.KnowledgeEntry.KnowledgeType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

@Data
public class KnowledgeUpdateRequest {

    /** 用户开始编辑时看到的版本，禁止旧页面覆盖较新的内容。 */
    @NotNull(message = "请重新加载文章后再保存")
    @PositiveOrZero
    private Long version;

    @NotBlank(message = "标题不能为空")
    @Size(max = 500, message = "标题最长500字符")
    private String title;

    @NotBlank(message = "内容不能为空")
    @Size(max = 2_000_000, message = "内容最长2,000,000字符")
    private String content;

    private KnowledgeType entryType;

    /** 可选迁移目标；省略或 null 保留原知识库，UUID 格式由反序列化校验。 */
    private UUID knowledgeBaseId;

    private UUID categoryId;

    /** 逗号分隔的标签 */
    @Size(max = 500, message = "标签最长500字符")
    private String tags;
}
