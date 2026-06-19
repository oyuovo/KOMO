package com.komo.security;

import com.komo.config.JwtConfig;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtTokenProviderTest {

    @Test
    void refreshTokenCannotAuthenticateAsAccessToken() {
        JwtTokenProvider provider = provider();
        UUID userId = UUID.randomUUID();
        String refreshToken = provider.generateRefreshToken(userId);

        assertFalse(provider.validateToken(refreshToken));
        assertTrue(provider.validateRefreshToken(refreshToken));
        assertEquals(userId, provider.getUserIdFromRefreshToken(refreshToken));
    }

    @Test
    void accessTokenStillValidatesForProtectedRequests() {
        JwtTokenProvider provider = provider();
        String accessToken = provider.generateAccessToken(UUID.randomUUID());

        assertTrue(provider.validateToken(accessToken));
    }

    private JwtTokenProvider provider() {
        JwtConfig config = new JwtConfig();
        config.setSecret("0123456789abcdef0123456789abcdef");
        config.setAccessTokenExpiration(3_600_000);
        config.setRefreshTokenExpiration(604_800_000);
        return new JwtTokenProvider(config);
    }
}
