package com.komo.service;

import com.komo.dto.ExtractionTaskPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * RabbitMQ 消费者 — 异步知识提取 Worker。
 *
 * 从 komo.extraction.queue 消费任务，调用 ConversationService
 * 的提取管线（Python LLM 提取 → 去重 → 路由 → 保存草稿）。
 *
 * 异常处理：
 *   抛出异常 → Spring AMQP 自动 NACK → 触发重试（配置在 application.yml）
 *   → 重试耗尽后 → 进入死信队列 komo.extraction.dlq
 */
@Component
public class ExtractionWorker {

    private static final Logger log = LoggerFactory.getLogger(ExtractionWorker.class);

    private final ConversationService conversationService;

    public ExtractionWorker(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    @RabbitListener(queues = "komo.extraction.queue", concurrency = "1")
    public void handleExtractionTask(ExtractionTaskPayload payload) {
        log.info("[extraction-worker] 收到提取任务 conversationId={} messageId={} messagesCount={}",
            payload.conversationId(), payload.messageId(), payload.messages().size());

        try {
            conversationService.extractAndSaveDrafts(
                payload.userId(),
                payload.conversationId(),
                payload.messageId(),
                payload.messages()
            );
            log.info("[extraction-worker] 提取完成 conversationId={}", payload.conversationId());
        } catch (Exception e) {
            log.error("[extraction-worker] 提取失败 conversationId={} messageId={}",
                payload.conversationId(), payload.messageId(), e);
            throw e; // 抛出以触发 RabbitMQ 重试 + DLQ
        }
    }
}
