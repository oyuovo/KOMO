package com.komo.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.boot.autoconfigure.amqp.SimpleRabbitListenerContainerFactoryConfigurer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RabbitMQ 配置 — 异步知识提取队列。
 *
 * 架构：
 *   komo.extraction (TopicExchange)
 *       ├── extraction.task → komo.extraction.queue → Worker 消费
 *       └── extraction.dlq  → komo.extraction.dlq  → 死信（重试耗尽后进入）
 *
 * 重试策略由 application.yml 的 spring.rabbitmq.listener.simple.retry 控制：
 *   初始间隔 3s，最多 3 次，指数退避 2x。
 */
@Configuration
public class RabbitMQConfig {

    public static final String EXCHANGE = "komo.extraction";
    public static final String QUEUE = "komo.extraction.queue";
    public static final String DLQ = "komo.extraction.dlq";
    public static final String ROUTING_KEY = "extraction.task";
    public static final String DLQ_ROUTING_KEY = "extraction.dlq";

    /** 共享的 JSON 消息转换器 — 生产者和消费者共用 */
    @Bean
    public MessageConverter jacksonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    /** Producer — 用 JSON 序列化后入队 */
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory, MessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(converter);
        return template;
    }

    /**
     * Consumer — 用 JSON 反序列化消息。
     * 覆盖 Spring Boot 自动配置，注入 Jackson converter，否则 Listener 拿到的是 byte[]。
     */
    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
        ConnectionFactory connectionFactory,
        SimpleRabbitListenerContainerFactoryConfigurer configurer,
        MessageConverter converter
    ) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        configurer.configure(factory, connectionFactory);
        factory.setMessageConverter(converter);
        return factory;
    }

    @Bean
    public TopicExchange extractionExchange() {
        return new TopicExchange(EXCHANGE);
    }

    @Bean
    public Queue extractionQueue() {
        return QueueBuilder.durable(QUEUE)
            .deadLetterExchange(EXCHANGE)
            .deadLetterRoutingKey(DLQ_ROUTING_KEY)
            .build();
    }

    @Bean
    public Queue extractionDlq() {
        return QueueBuilder.durable(DLQ).build();
    }

    @Bean
    public Binding extractionBinding() {
        return BindingBuilder.bind(extractionQueue())
            .to(extractionExchange())
            .with(ROUTING_KEY);
    }

    @Bean
    public Binding extractionDlqBinding() {
        return BindingBuilder.bind(extractionDlq())
            .to(extractionExchange())
            .with(DLQ_ROUTING_KEY);
    }
}
