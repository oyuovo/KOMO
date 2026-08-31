package com.komo.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 创建/重命名知识库请求。 */
@Data
public class KnowledgeBaseRequest {

    @NotBlank(message = "知识库名称不能为空")
    @Size(max = 100, message = "知识库名称不能超过 100 字")
    private String name;
}
