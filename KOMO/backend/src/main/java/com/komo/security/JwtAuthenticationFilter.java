package com.komo.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.UUID;

/**
 * JWT 认证过滤器。
 * 优先从 httpOnly Cookie 提取 access_token，兼容旧的 Authorization Bearer header。
 * 验证后将用户信息设置到 SecurityContext（Spring 和 KOMO 两层）。
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);

        if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
            UUID userId = jwtTokenProvider.getUserIdFromToken(token);

            // 设置 KOMO 自定义的 ThreadLocal 上下文
            SecurityContext.setCurrentUserId(userId);

            // 设置 Spring Security 上下文
            UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                    userId.toString(), null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
                );
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            SecurityContext.clear();
        }
    }

    private String extractToken(HttpServletRequest request) {
        // 优先从 httpOnly Cookie 读取
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("access_token".equals(cookie.getName())) {
                    String value = cookie.getValue();
                    if (StringUtils.hasText(value)) {
                        return value;
                    }
                }
            }
        }

        // 兼容旧 Authorization: Bearer <token> header
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
}
