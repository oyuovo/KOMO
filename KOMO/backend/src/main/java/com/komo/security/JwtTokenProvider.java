package com.komo.security;

import com.komo.config.JwtConfig;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * JWT 令牌提供器。
 * 负责 Access Token 和 Refresh Token 的生成、解析、校验。
 */
@Component
public class JwtTokenProvider {

    private static final Logger log = LoggerFactory.getLogger(JwtTokenProvider.class);

    private final JwtConfig jwtConfig;
    private final SecretKey accessKey;
    private final SecretKey refreshKey;

    public JwtTokenProvider(JwtConfig jwtConfig) {
        this.jwtConfig = jwtConfig;
        byte[] secretBytes = jwtConfig.getSecret().getBytes(StandardCharsets.UTF_8);
        // 验证密钥长度：HS256 至少需要 256 位（32 字节）
        if (secretBytes.length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes (256 bits) for HS256. "
                + "Generate with: openssl rand -base64 32");
        }
        SecretKey masterKey = Keys.hmacShaKeyFor(secretBytes);
        // 使用 HKDF 派生独立密钥：access 和 refresh 使用不同的签名密钥
        this.accessKey = deriveKey(masterKey, "access");
        this.refreshKey = deriveKey(masterKey, "refresh");
    }

    /** 从主密钥派生独立的子密钥 */
    private SecretKey deriveKey(SecretKey masterKey, String purpose) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(masterKey);
            byte[] derived = mac.doFinal(purpose.getBytes(StandardCharsets.UTF_8));
            return Keys.hmacShaKeyFor(derived);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to derive JWT key", e);
        }
    }

    public String generateAccessToken(UUID userId) {
        Date now = new Date();
        return Jwts.builder()
            .subject(userId.toString())
            .issuedAt(now)
            .expiration(new Date(now.getTime() + jwtConfig.getAccessTokenExpiration()))
            .signWith(accessKey)
            .compact();
    }

    public String generateRefreshToken(UUID userId) {
        Date now = new Date();
        return Jwts.builder()
            .subject(userId.toString())
            .issuedAt(now)
            .expiration(new Date(now.getTime() + jwtConfig.getRefreshTokenExpiration()))
            .signWith(refreshKey)
            .compact();
    }

    public UUID getUserIdFromToken(String token) {
        return getUserId(token, accessKey, "access");
    }

    public boolean validateToken(String token) {
        return validateToken(token, accessKey, "access");
    }

    public UUID getUserIdFromRefreshToken(String token) {
        return getUserId(token, refreshKey, "refresh");
    }

    public boolean validateRefreshToken(String token) {
        return validateToken(token, refreshKey, "refresh");
    }

    private UUID getUserId(String token, SecretKey key, String tokenType) {
        try {
            String subject = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
            return UUID.fromString(subject);
        } catch (Exception e) {
            log.debug("Invalid {} token", tokenType, e);
            throw new IllegalArgumentException("Invalid " + tokenType + " token", e);
        }
    }

    private boolean validateToken(String token, SecretKey key, String tokenType) {
        try {
            Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            log.debug("Invalid {} token", tokenType, e);
            return false;
        }
    }
}
