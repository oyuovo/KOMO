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

    /** 与 application.yml 中 komo.security.trusted-proxies 的默认值保持一致 */
    private static final String TRUSTED_PROXIES = "127.0.0.1,0:0:0:0:0:0:0:1,::1";
    private static final String LOGIN_PATH = "/api/auth/login";
    private static final String REGISTER_PATH = "/api/auth/register";

    @AfterEach
    void clearSecurityContext() {
        SecurityContext.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    void limitsStreamingMessageEndpointByAuthenticatedUser() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(TRUSTED_PROXIES);
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

    /**
     * 注册接口必须限流：脚本刷号会在公网无限注册新账号（每个自动建 2 个知识库）。
     * 同 IP 超过每小时上限后必须返回 429。
     */
    @Test
    void limitsRegistrationEndpointByIp() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(TRUSTED_PROXIES);

        MockHttpServletResponse lastResponse = null;
        for (int i = 0; i < 11; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", REGISTER_PATH);
            request.setRemoteAddr("203.0.113.20");
            lastResponse = new MockHttpServletResponse();
            filter.doFilter(request, lastResponse, (req, response) -> { });
        }

        assertEquals(429, lastResponse.getStatus());
    }

    /**
     * 注册限流与登录限流是独立桶：登录被打满不应影响同 IP 的注册，反之亦然。
     */
    @Test
    void registerLimitIsIndependentOfLoginLimit() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(TRUSTED_PROXIES);

        // 打满登录限流（5 次/分）
        for (int i = 0; i < 6; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", LOGIN_PATH);
            request.setRemoteAddr("203.0.113.21");
            filter.doFilter(request, new MockHttpServletResponse(), (req, response) -> { });
        }

        // 同 IP 注册仍应放行（远未到 10 次/小时）
        MockHttpServletRequest registerRequest = new MockHttpServletRequest("POST", REGISTER_PATH);
        registerRequest.setRemoteAddr("203.0.113.21");
        MockHttpServletResponse registerResponse = new MockHttpServletResponse();
        filter.doFilter(registerRequest, registerResponse, (req, response) -> { });

        assertEquals(200, registerResponse.getStatus());
    }

    /**
     * 攻击者自带 X-Forwarded-For、每次换一个伪造 IP，试图让按 IP 的登录限流失效。
     * nginx 会在最右侧写入真实客户端地址，过滤器必须取最右一跳而非最左值。
     */
    @Test
    void spoofedForwardedForCannotBypassLoginLimit() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(TRUSTED_PROXIES);
        String realClientIp = "203.0.113.9";

        MockHttpServletResponse lastResponse = null;
        for (int i = 0; i < 6; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", LOGIN_PATH);
            request.setRemoteAddr("127.0.0.1");   // 来自同机 nginx，属可信代理
            // 最左是每次变化的伪造值，最右是 nginx 写入的真实客户端
            request.addHeader("X-Forwarded-For", "198.51.100." + i + ", " + realClientIp);
            lastResponse = new MockHttpServletResponse();
            filter.doFilter(request, lastResponse, (req, response) -> { });
        }

        assertEquals(429, lastResponse.getStatus());
    }

    /**
     * 后端端口被直接暴露（未经反向代理）时，转发头一律不可信，
     * 必须回落到 getRemoteAddr()，同样不能靠伪造头绕过限流。
     */
    @Test
    void forwardedForFromUntrustedDirectConnectionIsIgnored() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(TRUSTED_PROXIES);

        MockHttpServletResponse lastResponse = null;
        for (int i = 0; i < 6; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", LOGIN_PATH);
            request.setRemoteAddr("198.51.100.7");          // 直连，非可信代理
            request.addHeader("X-Forwarded-For", "192.0.2." + i);  // 每次变化的伪造值
            lastResponse = new MockHttpServletResponse();
            filter.doFilter(request, lastResponse, (req, response) -> { });
        }

        assertEquals(429, lastResponse.getStatus());
    }
}
