package com.komo.controller;

import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.exception.GlobalExceptionHandler;
import com.komo.security.AuthCookieWriter;
import com.komo.security.SecurityContext;
import com.komo.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthRefreshTest {
    private final UserService users = mock(UserService.class);
    private MockMvc mvc;

    @AfterEach
    void cleanup() { SecurityContext.clear(); }

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(users, mock(AuthCookieWriter.class)))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void databaseFailureIsNotReportedAsExpiredCredentials() throws Exception {
        when(users.refreshToken("test-refresh")).thenThrow(new DataAccessResourceFailureException("private DB detail"));
        mvc.perform(post("/api/auth/refresh").contentType("application/json")
                .content("{\"refreshToken\":\"test-refresh\"}"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value(500))
            .andExpect(jsonPath("$.message").value("服务内部错误"));
    }

    @Test
    void invalidRefreshRemainsUnauthorized() throws Exception {
        when(users.refreshToken("test-refresh")).thenThrow(new BusinessException(ErrorCode.UNAUTHORIZED));
        mvc.perform(post("/api/auth/refresh").contentType("application/json")
                .content("{\"refreshToken\":\"test-refresh\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void otherBusinessFailuresKeepTheirStatus() throws Exception {
        when(users.refreshToken("test-refresh")).thenThrow(new BusinessException(ErrorCode.TOO_MANY_REQUESTS));
        mvc.perform(post("/api/auth/refresh").contentType("application/json")
                .content("{\"refreshToken\":\"test-refresh\"}"))
            .andExpect(status().isTooManyRequests());
    }

    @Test
    void sessionForRemovedUserReturnsUnauthorizedRatherThanUnrecoverableNotFound() throws Exception {
        var userId = java.util.UUID.randomUUID();
        SecurityContext.setCurrentUserId(userId);
        when(users.findById(userId)).thenThrow(new BusinessException(ErrorCode.NOT_FOUND));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void meDoesNotConfuseDatabaseOutageWithRemovedUser() throws Exception {
        var userId = java.util.UUID.randomUUID();
        SecurityContext.setCurrentUserId(userId);
        when(users.findById(userId)).thenThrow(new DataAccessResourceFailureException("unavailable"));
        mvc.perform(get("/api/auth/me")).andExpect(status().isInternalServerError());
    }
}
