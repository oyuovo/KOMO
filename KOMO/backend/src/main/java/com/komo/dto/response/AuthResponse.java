package com.komo.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class AuthResponse {
    private String accessToken;
    private String refreshToken;
    private long expiresIn;
    private UserInfo user;

    @Data
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String email;
        private String nickname;
        private boolean autoExtract;
        private boolean dailyRecommendationEnabled;
        private boolean onboardingCompleted;
    }
}
