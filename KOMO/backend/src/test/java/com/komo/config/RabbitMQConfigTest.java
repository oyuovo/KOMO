package com.komo.config;

import com.komo.dto.ExtractionTaskPayload;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.support.converter.MessageConverter;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class RabbitMQConfigTest {

    @Test
    void extractionPayloadRoundTripsThroughConfiguredJsonConverter() {
        RabbitMQConfig config = new RabbitMQConfig();
        MessageConverter converter = config.jacksonMessageConverter();
        ExtractionTaskPayload payload = new ExtractionTaskPayload(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
            List.of(Map.of("role", "user", "content", "hello")));

        Message message = converter.toMessage(payload, new MessageProperties());
        Object converted = converter.fromMessage(message);

        ExtractionTaskPayload roundTripped =
            assertInstanceOf(ExtractionTaskPayload.class, converted);
        assertEquals(payload, roundTripped);
    }
}
