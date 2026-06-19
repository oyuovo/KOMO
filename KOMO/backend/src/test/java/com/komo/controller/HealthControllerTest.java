package com.komo.controller;

import com.komo.dto.response.ApiResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HealthControllerTest {

    @Test
    void returnsPublicUpStatus() {
        HealthController controller = new HealthController();

        ResponseEntity<ApiResponse<Map<String, String>>> response = controller.health();

        assertEquals(200, response.getStatusCode().value());
        assertEquals(0, response.getBody().getCode());
        assertEquals("UP", response.getBody().getData().get("status"));
    }
}
