package com.komo.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * JWT 配置属性，绑定 application.yml 中的 komo.jwt.*。
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "komo.jwt")
public class JwtConfig {
    /** HMAC-SHA 密钥 */
    private String secret;
    /** Access Token 有效期 (ms) */
    private long accessTokenExpiration;
    /** Refresh Token 有效期 (ms) */
    private long refreshTokenExpiration;
}
