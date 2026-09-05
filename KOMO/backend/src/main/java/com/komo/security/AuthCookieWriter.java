package com.komo.security;

import com.komo.config.CookieConfig;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * 认证 Cookie 的写入与清除。
 *
 * <p>集中在一处的原因：浏览器只有在 name / path / domain 完全一致时，才把两次 Set-Cookie
 * 视为同一条 Cookie。清除时若属性与设置时对不上（哪怕只差一个 Secure 或 SameSite），
 * 登出就删不掉 token —— 用户点了"退出登录"，本地却仍持有可用凭证。
 * 因此这里让写入与清除共用同一份属性构造逻辑，避免两处各自硬编码而悄悄走偏。
 */
@Component
@RequiredArgsConstructor
public class AuthCookieWriter {

    public static final String ACCESS_TOKEN_COOKIE = "access_token";
    public static final String REFRESH_TOKEN_COOKIE = "refresh_token";

    /** access token 有效期 1 小时，与 komo.jwt.access-token-expiration 一致 */
    private static final long ACCESS_MAX_AGE_SECONDS = 3600;
    /** refresh token 有效期 7 天，与 komo.jwt.refresh-token-expiration 一致 */
    private static final long REFRESH_MAX_AGE_SECONDS = 604800;

    /** access token 供所有 /api 接口使用 */
    private static final String ACCESS_PATH = "/api";
    /** refresh token 只有刷新接口用得到，收窄 path 减少随请求外泄的面 */
    private static final String REFRESH_PATH = "/api/auth/refresh";

    private final CookieConfig cookieConfig;

    /** 注册 / 登录 / 刷新成功后写入认证 Cookie */
    public void write(HttpServletResponse response, String accessToken, String refreshToken) {
        addCookie(response, accessCookie(accessToken, ACCESS_MAX_AGE_SECONDS));
        addCookie(response, refreshCookie(refreshToken, REFRESH_MAX_AGE_SECONDS));
    }

    /** 登出时清除认证 Cookie（Max-Age=0） */
    public void clear(HttpServletResponse response) {
        addCookie(response, accessCookie("", 0));
        addCookie(response, refreshCookie("", 0));
    }

    private ResponseCookie accessCookie(String value, long maxAge) {
        return build(ACCESS_TOKEN_COOKIE, value, ACCESS_PATH, "Lax", maxAge);
    }

    private ResponseCookie refreshCookie(String value, long maxAge) {
        // 刷新只由本站脚本发起，SameSite=Strict 足以挡掉跨站携带
        return build(REFRESH_TOKEN_COOKIE, value, REFRESH_PATH, "Strict", maxAge);
    }

    private ResponseCookie build(String name, String value, String path, String sameSite, long maxAge) {
        return ResponseCookie.from(name, value)
            .httpOnly(true)
            .secure(cookieConfig.isSecure())
            .sameSite(sameSite)
            .path(path)
            .maxAge(maxAge)
            .build();
    }

    private void addCookie(HttpServletResponse response, ResponseCookie cookie) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
