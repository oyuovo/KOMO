package com.komo.controller;

import com.komo.dto.request.LoginRequest;
import com.komo.dto.request.RegisterRequest;
import com.komo.dto.response.ApiResponse;
import com.komo.dto.response.AuthResponse;
import com.komo.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse auth = userService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(auth));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse auth = userService.login(request);
        return ResponseEntity.ok(ApiResponse.success(auth));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@RequestBody Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        if (refreshToken == null || refreshToken.isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "refreshToken 不能为空"));
        }
        try {
            AuthResponse auth = userService.refreshToken(refreshToken);
            return ResponseEntity.ok(ApiResponse.success(auth));
        } catch (Exception e) {
            return ResponseEntity.status(401)
                .body(ApiResponse.error(401, "refreshToken 无效或已过期"));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<ApiResponse<String>> health() {
        return ResponseEntity.ok(ApiResponse.success("KOMO API is running"));
    }
}
