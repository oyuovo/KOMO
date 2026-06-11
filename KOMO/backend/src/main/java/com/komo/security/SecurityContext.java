package com.komo.security;

import java.util.UUID;

/**
 * 线程级安全上下文。
 * 使用 ThreadLocal 持有当前请求的已认证用户 ID，
 * 在 Filter 中设置，请求结束时清除。
 */
public final class SecurityContext {

    private static final ThreadLocal<UUID> CURRENT_USER = new ThreadLocal<>();

    private SecurityContext() {
        // 工具类，禁止实例化
    }

    public static void setCurrentUserId(UUID userId) {
        CURRENT_USER.set(userId);
    }

    public static UUID getCurrentUserId() {
        UUID userId = CURRENT_USER.get();
        if (userId == null) {
            throw new IllegalStateException("No authenticated user in context");
        }
        return userId;
    }

    public static void clear() {
        CURRENT_USER.remove();
    }
}
