package com.komo.security;

import com.komo.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 简易内存限流过滤器。
 * 登录接口按 IP 限频，AI 消息接口按用户限频。
 * 生产环境建议替换为 Redis + Bucket4j 方案。
 *
 * <p>客户端 IP 的可信边界见 {@link #getClientIp(HttpServletRequest)}：转发头只在
 * 请求确实来自可信反向代理时才被采信，且只取最右一跳。
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

    /**
     * 可信反向代理地址（如 nginx）。只有来自这些地址的请求，其转发头才被采信。
     * 默认回环地址 —— 生产部署中 nginx 与后端同机；若代理跑在容器/其他主机，
     * 需通过 TRUSTED_PROXIES 环境变量补上对应地址，否则限流会退化为按直连地址统计。
     */
    private final Set<String> trustedProxies;

    public RateLimitFilter(
            @Value("${komo.security.trusted-proxies:127.0.0.1,0:0:0:0:0:0:0:1,::1}") String trustedProxiesConfig) {
        this.trustedProxies = Arrays.stream(trustedProxiesConfig.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toUnmodifiableSet());
    }

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

    /**
     * 解析真实客户端 IP。
     *
     * <p>{@code X-Forwarded-For} 与 {@code X-Real-IP} 都是客户端可任意伪造的请求头，
     * 因此分两层防护：
     * <ol>
     *   <li><b>只信可信代理</b> —— 直连地址不在 {@code trustedProxies} 中时，转发头一律忽略，
     *       直接用 {@code getRemoteAddr()}（此时它就是真实客户端，无法伪造）。</li>
     *   <li><b>只取最右一跳</b> —— XFF 由各级代理依次向左追加，最右值是最近那个可信代理
     *       亲眼看到的对端地址，客户端改不了。取最左值则是经典错误：那正是攻击者自带的内容，
     *       每次请求换一个伪造 IP 就能让按 IP 的登录限流完全失效。</li>
     * </ol>
     */
    private String getClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (remoteAddr == null || !trustedProxies.contains(remoteAddr)) {
            if (request.getHeader("X-Forwarded-For") != null) {
                log.warn("来自非可信地址 {} 的请求携带 X-Forwarded-For，已忽略该头并改用直连地址；"
                    + "若它确实是反向代理，请通过 TRUSTED_PROXIES 配置 komo.security.trusted-proxies", remoteAddr);
            }
            return remoteAddr;
        }

        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String[] hops = xff.split(",");
            for (int i = hops.length - 1; i >= 0; i--) {
                String hop = hops[i].trim();
                if (!hop.isEmpty()) {
                    return hop;
                }
            }
        }

        String realIp = request.getHeader("X-Real-IP");
        return (realIp != null && !realIp.isBlank()) ? realIp.trim() : remoteAddr;
    }

    private void sendError(HttpServletResponse response, ErrorCode code, String message) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        om.writeValue(response.getWriter(), Map.of("code", code.getCode(), "message", message));
    }
}
