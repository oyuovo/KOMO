package com.komo.dto.response;

import com.komo.entity.User;
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

        /** 统一的 User → UserInfo 映射（唯一入口，避免多处 builder 重复） */
        public static UserInfo from(User user) {
            return UserInfo.builder()
                .id(user.getId().toString())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .autoExtract(Boolean.TRUE.equals(user.getAutoExtract()))
                .dailyRecommendationEnabled(!Boolean.FALSE.equals(user.getDailyRecommendationEnabled()))
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .build();
        }
    }
}
