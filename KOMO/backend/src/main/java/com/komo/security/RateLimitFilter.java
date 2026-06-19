package com.komo.security;

import com.komo.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * 简易内存限流过滤器。
 * 登录接口按 IP 限频，AI 消息接口按用户限频。
 * 生产环境建议替换为 Redis + Bucket4j 方案。
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final ObjectMapper om = new ObjectMapper();

    // 登录：每分钟每个 IP 最多 5 次
    private static final int LOGIN_MAX = 5;
    private static final long LOGIN_WINDOW_MS = TimeUnit.MINUTES.toMillis(1);

    // AI 消息：每分钟每个用户最多 10 次
    private static final int AI_MAX = 10;
    private static final long AI_WINDOW_MS = TimeUnit.MINUTES.toMillis(1);

    private final ConcurrentHashMap<String, long[]> loginCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, long[]> aiCounts = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        String method = request.getMethod();

        // 登录接口限流
        if ("POST".equals(method) && path.equals("/api/auth/login")) {
            String ip = getClientIp(request);
            if (isRateLimited(loginCounts, ip, LOGIN_MAX, LOGIN_WINDOW_MS)) {
                log.warn("登录限流触发 ip={}", ip);
                sendError(response, ErrorCode.TOO_MANY_REQUESTS, "登录请求过于频繁，请稍后再试");
                return;
            }
        }

        // AI 消息接口限流
        if ("POST".equals(method)
            && path.matches("/api/conversations/[^/]+/messages(?:/stream)?")) {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userId = authentication != null && authentication.isAuthenticated()
                ? authentication.getName()
                : getClientIp(request);
            if (isRateLimited(aiCounts, userId, AI_MAX, AI_WINDOW_MS)) {
                log.warn("AI消息限流触发 userId/ip={}", userId);
                sendError(response, ErrorCode.TOO_MANY_REQUESTS, "AI 消息请求过于频繁，请稍后再试");
                return;
            }
        }

        chain.doFilter(request, response);
    }

    private boolean isRateLimited(ConcurrentHashMap<String, long[]> store, String key, int max, long windowMs) {
        long now = System.currentTimeMillis();
        long[] timestamps = store.computeIfAbsent(key, k -> new long[max]);
        synchronized (timestamps) {
            int count = 0;
            for (int i = 0; i < timestamps.length; i++) {
                if (timestamps[i] > 0 && now - timestamps[i] > windowMs) {
                    timestamps[i] = 0; // 过期
                }
                if (timestamps[i] > 0) count++;
            }
            if (count >= max) return true;
            // 找到空槽写入
            for (int i = 0; i < timestamps.length; i++) {
                if (timestamps[i] == 0) {
                    timestamps[i] = now;
                    break;
                }
            }
            return false;
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        return realIp != null ? realIp : request.getRemoteAddr();
    }

    private void sendError(HttpServletResponse response, ErrorCode code, String message) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        om.writeValue(response.getWriter(), Map.of("code", code.getCode(), "message", message));
    }
}
