package com.komo.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 认证 Cookie 配置属性，绑定 application.yml 中的 komo.cookie.*。
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "komo.cookie")
public class CookieConfig {

    /**
     * 是否给认证 Cookie 打 Secure 标记（仅允许通过 HTTPS 传输）。
     *
     * <p>生产环境必须为 true，否则 access_token / refresh_token 可能在明文 HTTP 请求中被窃听。
     * 本地开发走 http://localhost，为 true 时浏览器会直接丢弃 Cookie 导致登录态无法保持，
     * 因此默认 false，由环境变量 COOKIE_SECURE 在生产覆盖。
     */
    private boolean secure = false;
}
