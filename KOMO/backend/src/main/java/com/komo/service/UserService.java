package com.komo.service;

import java.util.UUID;

import com.komo.config.JwtConfig;
import com.komo.dto.request.LoginRequest;
import com.komo.dto.request.RegisterRequest;
import com.komo.dto.response.AuthResponse;
import com.komo.entity.User;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.UserRepository;
import com.komo.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用户服务。
 * 处理注册、登录逻辑，不继承 BaseService（用户表无归属关系）。
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JwtConfig jwtConfig;
    private final AuthenticationManager authenticationManager;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS);
        }

        User user = User.builder()
            .email(request.getEmail())
            .password(passwordEncoder.encode(request.getPassword()))
            .nickname(request.getNickname() != null ? request.getNickname() : request.getEmail())
            .build();

        user = userRepository.save(user);
        log.info("[AUDIT] action=USER_REGISTER userId={} email={}", user.getId(), user.getEmail());
        return buildAuthResponse(user);
    }

    public AuthResponse login(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );
        } catch (BadCredentialsException e) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));

        return buildAuthResponse(user);
    }

    public AuthResponse refreshToken(String refreshToken) {
        if (!jwtTokenProvider.validateRefreshToken(refreshToken)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "refreshToken 无效或已过期");
        }

        UUID userId = jwtTokenProvider.getUserIdFromRefreshToken(refreshToken);
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "用户不存在"));

        return buildAuthResponse(user);
    }

    public User findById(UUID userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "用户不存在"));
    }

    private AuthResponse buildAuthResponse(User user) {
        String accessToken = jwtTokenProvider.generateAccessToken(user.getId());
        String refreshToken = jwtTokenProvider.generateRefreshToken(user.getId());

        return AuthResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresIn(jwtConfig.getAccessTokenExpiration())
            .user(AuthResponse.UserInfo.builder()
                .id(user.getId().toString())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .build())
            .build();
    }
}
