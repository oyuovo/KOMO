package com.komo.security;

import com.komo.config.CookieConfig;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthCookieWriterTest {

    /** Max-Age / Expires 在写入与清除时本就不同，不参与属性一致性比较 */
    private static final Set<String> VOLATILE_ATTRIBUTES = Set.of("max-age", "expires");

    private static AuthCookieWriter writerWith(boolean secure) {
        CookieConfig config = new CookieConfig();
        config.setSecure(secure);
        return new AuthCookieWriter(config);
    }

    /** 生产走 HTTPS，两个认证 Cookie 都必须带 Secure */
    @Test
    void secureFlagIsAppliedWhenEnabled() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        writerWith(true).write(response, "access-1", "refresh-1");

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertEquals(2, cookies.size());
        for (String cookie : cookies) {
            assertTrue(attributeNames(cookie).contains("secure"),
                "生产配置下应带 Secure 标记: " + cookie);
        }
    }

    /** 本地 http 开发不能带 Secure，否则浏览器直接丢弃 Cookie */
    @Test
    void secureFlagIsOmittedWhenDisabled() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        writerWith(false).write(response, "access-1", "refresh-1");

        for (String cookie : response.getHeaders(HttpHeaders.SET_COOKIE)) {
            assertFalse(attributeNames(cookie).contains("secure"),
                "本地开发配置下不应带 Secure 标记: " + cookie);
        }
    }

    /**
     * 浏览器只在 name / path / domain / secure / samesite 全部一致时，才把清除请求
     * 认作同一条 Cookie。任一属性对不上，登出就删不掉 token，用户"退出"后仍持有有效凭证。
     */
    @Test
    void clearUsesSameAttributesAsWrite() {
        MockHttpServletResponse written = new MockHttpServletResponse();
        MockHttpServletResponse cleared = new MockHttpServletResponse();
        AuthCookieWriter writer = writerWith(true);

        writer.write(written, "access-1", "refresh-1");
        writer.clear(cleared);

        assertEquals(attributesByCookieName(written), attributesByCookieName(cleared));
    }

    @Test
    void writeScopesEachCookieAndExpiresOnClear() {
        MockHttpServletResponse written = new MockHttpServletResponse();
        writerWith(false).write(written, "access-1", "refresh-1");

        Map<String, String> cookies = valueByCookieName(written);
        assertEquals("access-1", cookies.get(AuthCookieWriter.ACCESS_TOKEN_COOKIE));
        assertEquals("refresh-1", cookies.get(AuthCookieWriter.REFRESH_TOKEN_COOKIE));

        String access = headerFor(written, AuthCookieWriter.ACCESS_TOKEN_COOKIE);
        assertTrue(access.contains("Path=/api"), access);
        assertTrue(access.contains("SameSite=Lax"), access);
        assertTrue(access.contains("Max-Age=3600"), access);
        assertTrue(attributeNames(access).contains("httponly"), access);

        String refresh = headerFor(written, AuthCookieWriter.REFRESH_TOKEN_COOKIE);
        assertTrue(refresh.contains("Path=/api/auth/refresh"), refresh);
        assertTrue(refresh.contains("SameSite=Strict"), refresh);
        assertTrue(refresh.contains("Max-Age=604800"), refresh);

        MockHttpServletResponse cleared = new MockHttpServletResponse();
        writerWith(false).clear(cleared);
        for (String name : List.of(AuthCookieWriter.ACCESS_TOKEN_COOKIE,
                                    AuthCookieWriter.REFRESH_TOKEN_COOKIE)) {
            assertTrue(headerFor(cleared, name).contains("Max-Age=0"),
                "登出必须让 " + name + " 立即过期");
        }
    }

    private static String headerFor(MockHttpServletResponse response, String cookieName) {
        return response.getHeaders(HttpHeaders.SET_COOKIE).stream()
            .filter(header -> header.startsWith(cookieName + "="))
            .findFirst()
            .orElseThrow(() -> new AssertionError("响应中没有 " + cookieName + " 的 Set-Cookie"));
    }

    private static Map<String, String> valueByCookieName(MockHttpServletResponse response) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String header : response.getHeaders(HttpHeaders.SET_COOKIE)) {
            String pair = header.split(";", 2)[0];
            String[] nameValue = pair.split("=", 2);
            result.put(nameValue[0].trim(), nameValue.length > 1 ? nameValue[1].trim() : "");
        }
        return result;
    }

    /** 每条 Cookie 的属性名集合（小写），用于判断 HttpOnly / Secure 这类开关是否存在 */
    private static Set<String> attributeNames(String header) {
        Set<String> names = new TreeSet<>();
        for (String part : header.split(";")) {
            String attribute = part.trim();
            if (attribute.isEmpty()) continue;
            names.add(attribute.split("=", 2)[0].trim().toLowerCase());
        }
        return names;
    }

    private static Map<String, Set<String>> attributesByCookieName(MockHttpServletResponse response) {
        Map<String, Set<String>> result = new LinkedHashMap<>();
        for (String header : response.getHeaders(HttpHeaders.SET_COOKIE)) {
            String[] parts = header.split(";");
            String name = parts[0].split("=", 2)[0].trim();
            Set<String> attributes = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
            for (int i = 1; i < parts.length; i++) {
                String attribute = parts[i].trim();
                if (attribute.isEmpty()) continue;
                if (VOLATILE_ATTRIBUTES.contains(attribute.split("=", 2)[0].trim().toLowerCase())) {
                    continue;
                }
                attributes.add(attribute);
            }
            result.put(name, attributes);
        }
        return result;
    }
}
