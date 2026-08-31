package com.komo.dto.request;

import lombok.Data;

import java.util.UUID;

/** 切换对话归属知识库请求。knowledgeBaseId 为 null 表示切换为无知识库对话。 */
@Data
public class ConversationKbRequest {

    private UUID knowledgeBaseId;
}
