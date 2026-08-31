package com.komo.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

/** 创建对话请求。knowledgeBaseId 为空表示无知识库对话（不提取知识）。 */
@Data
public class ConversationCreateRequest {

    @Size(max = 200, message = "对话标题不能超过 200 字")
    private String title;

    private UUID knowledgeBaseId;
}
