package com.komo.controller;

import com.komo.dto.request.LoginRequest;
import com.komo.dto.request.PreferenceUpdateRequest;
import com.komo.dto.request.RegisterRequest;
import com.komo.dto.response.ApiResponse;
import com.komo.dto.response.AuthResponse;
import com.komo.entity.User;
import com.komo.security.SecurityContext;
import com.komo.service.UserService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserService userService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(
        @Valid @RequestBody RegisterRequest request,
        HttpServletResponse response
    ) {
        AuthResponse auth = userService.register(request);
        setAuthCookies(response, auth.getAccessToken(), auth.getRefreshToken());
        auth.setAccessToken(null);
        auth.setRefreshToken(null);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(auth));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
        @Valid @RequestBody LoginRequest request,
        HttpServletResponse response
    ) {
        AuthResponse auth = userService.login(request);
        setAuthCookies(response, auth.getAccessToken(), auth.getRefreshToken());
        auth.setAccessToken(null);
        auth.setRefreshToken(null);
        return ResponseEntity.ok(ApiResponse.success(auth));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        String refreshToken = extractCookie(request, "refresh_token");
        if (refreshToken == null || refreshToken.isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "refreshToken 不能为空"));
        }
        try {
            AuthResponse auth = userService.refreshToken(refreshToken);
            setAuthCookies(response, auth.getAccessToken(), auth.getRefreshToken());
            auth.setAccessToken(null);
            auth.setRefreshToken(null);
            return ResponseEntity.ok(ApiResponse.success(auth));
        } catch (Exception e) {
            return ResponseEntity.status(401)
                .body(ApiResponse.error(401, "refreshToken 无效或已过期"));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<AuthResponse.UserInfo>> me(HttpServletRequest request) {
        // 强制触发 CSRF Token 生成，使 CookieCsrfTokenRepository 写入 XSRF-TOKEN cookie
        request.getAttribute(CsrfToken.class.getName());

        UUID userId = SecurityContext.getCurrentUserId();
        if (userId == null) {
            return ResponseEntity.status(401)
                .body(ApiResponse.error(401, "未登录"));
        }
        User user = userService.findById(userId);
        return ResponseEntity.ok(ApiResponse.success(
            AuthResponse.UserInfo.builder()
                .id(user.getId().toString())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .autoExtract(Boolean.TRUE.equals(user.getAutoExtract()))
                .dailyRecommendationEnabled(!Boolean.FALSE.equals(user.getDailyRecommendationEnabled()))
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .build()
        ));
    }

    @PutMapping("/preferences")
    public ResponseEntity<ApiResponse<AuthResponse.UserInfo>> updatePreferences(
        @Valid @RequestBody PreferenceUpdateRequest request
    ) {
        UUID userId = SecurityContext.getCurrentUserId();
        if (userId == null) {
            return ResponseEntity.status(401)
                .body(ApiResponse.error(401, "未登录"));
        }
        User user = userService.updatePreferences(userId, request);
        return ResponseEntity.ok(ApiResponse.success(
            AuthResponse.UserInfo.builder()
                .id(user.getId().toString())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .autoExtract(Boolean.TRUE.equals(user.getAutoExtract()))
                .dailyRecommendationEnabled(!Boolean.FALSE.equals(user.getDailyRecommendationEnabled()))
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .build()
        ));
    }

    @PutMapping("/onboarding/complete")
    public ResponseEntity<ApiResponse<AuthResponse.UserInfo>> completeOnboarding() {
        UUID userId = SecurityContext.getCurrentUserId();
        User user = userService.completeOnboarding(userId);
        return ResponseEntity.ok(ApiResponse.success(
            AuthResponse.UserInfo.builder()
                .id(user.getId().toString())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .autoExtract(Boolean.TRUE.equals(user.getAutoExtract()))
                .dailyRecommendationEnabled(!Boolean.FALSE.equals(user.getDailyRecommendationEnabled()))
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .build()
        ));
    }

    @PutMapping("/onboarding/reset")
    public ResponseEntity<ApiResponse<AuthResponse.UserInfo>> resetOnboarding() {
        UUID userId = SecurityContext.getCurrentUserId();
        User user = userService.resetOnboarding(userId);
        return ResponseEntity.ok(ApiResponse.success(
            AuthResponse.UserInfo.builder()
                .id(user.getId().toString())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .autoExtract(Boolean.TRUE.equals(user.getAutoExtract()))
                .dailyRecommendationEnabled(!Boolean.FALSE.equals(user.getDailyRecommendationEnabled()))
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .build()
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(HttpServletResponse response) {
        clearAuthCookies(response);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    // ── cookie helpers ──

    private void setAuthCookies(HttpServletResponse response, String accessToken, String refreshToken) {
        ResponseCookie accessCookie = ResponseCookie.from("access_token", accessToken)
            .httpOnly(true)
            .secure(false) // 生产改为 true
            .sameSite("Lax")
            .path("/api")
            .maxAge(3600)
            .build();
        ResponseCookie refreshCookie = ResponseCookie.from("refresh_token", refreshToken)
            .httpOnly(true)
            .secure(false)
            .sameSite("Strict")
            .path("/api/auth/refresh")
            .maxAge(604800)
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, accessCookie.toString());
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie.toString());
    }

    private void clearAuthCookies(HttpServletResponse response) {
        ResponseCookie accessCookie = ResponseCookie.from("access_token", "")
            .httpOnly(true).secure(false).sameSite("Lax").path("/api").maxAge(0).build();
        ResponseCookie refreshCookie = ResponseCookie.from("refresh_token", "")
            .httpOnly(true).secure(false).sameSite("Strict").path("/api/auth/refresh").maxAge(0).build();
        response.addHeader(HttpHeaders.SET_COOKIE, accessCookie.toString());
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie.toString());
    }

    private String extractCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (name.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
