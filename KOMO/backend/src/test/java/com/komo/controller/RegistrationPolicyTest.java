package com.komo.controller;

import com.komo.config.JwtConfig;
import com.komo.entity.User;
import com.komo.exception.GlobalExceptionHandler;
import com.komo.repository.UserRepository;
import com.komo.security.AuthCookieWriter;
import com.komo.security.JwtTokenProvider;
import com.komo.security.RateLimitFilter;
import com.komo.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RegistrationPolicyTest {
    private final UserRepository repository = mock(UserRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final JwtTokenProvider tokens = mock(JwtTokenProvider.class);
    private final AuthenticationManager authentication = mock(AuthenticationManager.class);
    private final AuthCookieWriter cookies = mock(AuthCookieWriter.class);
    private final UserService users = new UserService(repository, passwords, tokens, new JwtConfig(), authentication);
    private MockMvc mvc;
    // Synthetic credentials for isolated tests; never used against a running service.
    private static final String REGISTRATION = """
        {"email":"registration@example.invalid","password":"TestOnly123","nickname":"Test"}
        """;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(users, cookies))
            .setControllerAdvice(new GlobalExceptionHandler())
            .addFilters(new RateLimitFilter("127.0.0.1"))
            .build();
    }

    @Test
    void springDefaultsToClosedAndRequiresExplicitOptIn() {
        var context = new ApplicationContextRunner().withBean(UserService.class, () -> users);
        context.run(app -> assertFalse(app.getBean(UserService.class).isRegistrationEnabled()));
        context.withPropertyValues("komo.auth.registration-enabled=true")
            .run(app -> assertTrue(app.getBean(UserService.class).isRegistrationEnabled()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"web", "desktop", "mobile"})
    void closedRegistrationRejectsEveryClientBeforeDatabaseOrTokenWork(String client) throws Exception {
        mvc.perform(post("/api/auth/register").header("X-Komo-Client", client)
                .contentType("application/json").content(REGISTRATION))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value("本站暂不开放注册"))
            .andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(repository, passwords, tokens, cookies);
    }

    @Test
    void publicConfigTracksBackendSwitchAndDisablesCaching() throws Exception {
        mvc.perform(get("/api/auth/config")).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.registrationEnabled").value(false))
            .andExpect(header().string("Cache-Control", "no-store"));
        ReflectionTestUtils.setField(users, "registrationEnabled", true);
        mvc.perform(get("/api/auth/config")).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.registrationEnabled").value(true));
        verifyNoInteractions(repository);
    }

    private User prepareUser() {
        User user = User.builder().email("registration@example.invalid").nickname("Test").build();
        user.setId(UUID.randomUUID());
        when(tokens.generateAccessToken(user.getId())).thenReturn("test-access");
        when(tokens.generateRefreshToken(user.getId())).thenReturn("test-refresh");
        return user;
    }

    @ParameterizedTest
    @ValueSource(strings = {"web", "desktop"})
    void explicitOptInKeepsRegistrationAndClientTokenContract(String client) throws Exception {
        ReflectionTestUtils.setField(users, "registrationEnabled", true);
        User user = prepareUser();
        when(passwords.encode(anyString())).thenReturn("test-hash");
        when(repository.save(any(User.class))).thenReturn(user);
        var result = mvc.perform(post("/api/auth/register").header("X-Komo-Client", client)
            .contentType("application/json").content(REGISTRATION))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.user.email").value(user.getEmail()));
        if ("desktop".equals(client)) result.andExpect(jsonPath("$.data.accessToken").value("test-access"));
        else result.andExpect(jsonPath("$.data.accessToken").isEmpty());
        verify(repository).save(argThat(saved -> "test-hash".equals(saved.getPassword())));
        verify(cookies).write(any(), eq("test-access"), eq("test-refresh"));
    }

    @Test
    void closedRegistrationStillAllowsExistingLoginAndRefresh() throws Exception {
        User user = prepareUser();
        when(repository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(tokens.validateRefreshToken("existing-refresh")).thenReturn(true);
        when(tokens.getUserIdFromRefreshToken("existing-refresh")).thenReturn(user.getId());
        when(repository.findById(user.getId())).thenReturn(Optional.of(user));
        mvc.perform(post("/api/auth/login").contentType("application/json").content(REGISTRATION))
            .andExpect(status().isOk());
        mvc.perform(post("/api/auth/refresh").contentType("application/json")
                .content("{\"refreshToken\":\"existing-refresh\"}"))
            .andExpect(status().isOk());
        verify(repository, never()).save(any());
    }

    @Test
    void optInStillValidatesInputAndEnforcesRegistrationRateLimit() throws Exception {
        ReflectionTestUtils.setField(users, "registrationEnabled", true);
        for (int attempt = 0; attempt < 10; attempt++) {
            mvc.perform(post("/api/auth/register").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/auth/register").contentType("application/json").content(REGISTRATION))
            .andExpect(status().isTooManyRequests());
        verifyNoInteractions(repository, passwords, tokens);
    }
}
