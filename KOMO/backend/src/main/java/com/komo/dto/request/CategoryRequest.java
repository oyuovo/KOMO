package com.komo.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

@Data
public class CategoryRequest {

    @NotBlank(message = "分类名不能为空")
    @Size(max = 200, message = "分类名最长200字符")
    private String name;

    /** 归属知识库 ID（创建时必填，更新时忽略） */
    private UUID knowledgeBaseId;

    /** 父分类 ID，null 表示根级 */
    private UUID parentId;
}
