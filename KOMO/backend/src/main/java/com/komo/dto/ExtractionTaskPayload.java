package com.komo.dto;

import java.io.Serializable;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * RabbitMQ 提取任务负载。
 * 包含对话上下文快照，Worker 消费后调用 Python 提取服务。
 */
public record ExtractionTaskPayload(
    UUID userId,
    UUID conversationId,
    UUID messageId,
    List<Map<String, String>> messages
) implements Serializable {
}
