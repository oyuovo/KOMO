package com.komo.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RateLimitFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContext.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    void limitsStreamingMessageEndpointByAuthenticatedUser() throws Exception {
        RateLimitFilter filter = new RateLimitFilter();
        UUID userId = UUID.randomUUID();
        SecurityContext.setCurrentUserId(userId);
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(userId.toString(), null, java.util.List.of()));

        MockHttpServletResponse lastResponse = null;
        for (int i = 0; i < 11; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest(
                "POST", "/api/conversations/00000000-0000-0000-0000-000000000001/messages/stream");
            request.setRemoteAddr("192.0.2." + i);
            lastResponse = new MockHttpServletResponse();
            filter.doFilter(request, lastResponse, (req, response) -> { });
        }

        assertEquals(429, lastResponse.getStatus());
    }
}
