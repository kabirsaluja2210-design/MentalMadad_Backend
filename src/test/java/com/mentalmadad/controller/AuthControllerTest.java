package com.mentalmadad.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mentalmadad.dto.request.LoginRequest;
import com.mentalmadad.dto.request.RegisterRequest;
import com.mentalmadad.dto.response.AuthResponse;
import com.mentalmadad.dto.response.UserResponse;
import com.mentalmadad.security.JwtProvider;
import com.mentalmadad.security.CustomUserDetailsService;
import com.mentalmadad.service.AuthService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for AuthController using MockMvc.
 *
 * Security auto-configuration is excluded — these tests focus on the controller
 * layer only (request validation, JSON serialization/deserialization, HTTP
 * status codes). The JWT filter chain is not exercised here.
 *
 * Jackson deserialization is tested implicitly: MockMvc serializes the request
 * body to JSON and the controller deserializes it back.
 */
@WebMvcTest(
    value = AuthController.class,
    excludeAutoConfiguration = {
        SecurityAutoConfiguration.class,
        SecurityFilterAutoConfiguration.class,
        UserDetailsServiceAutoConfiguration.class
    }
)
@DisplayName("AuthController Integration Tests")
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper; // Jackson ObjectMapper — tests serialization/deserialization

    @MockBean
    private AuthService authService;

    @MockBean
    private JwtProvider jwtProvider;

    @MockBean
    private CustomUserDetailsService customUserDetailsService;

    @Test
    @DisplayName("POST /api/auth/register — should return 201 with auth tokens")
    void register_ValidRequest_Returns201() throws Exception {
        // Arrange
        RegisterRequest request = RegisterRequest.builder()
                .email("newuser@test.com")
                .password("password123")
                .firstName("New")
                .lastName("User")
                .build();

        UserResponse userResponse = UserResponse.builder()
                .id(1L)
                .email("newuser@test.com")
                .firstName("New")
                .lastName("User")
                .role("PATIENT")
                .emailVerified(false)
                .build();

        AuthResponse authResponse = AuthResponse.builder()
                .accessToken("test-access-token")
                .refreshToken("test-refresh-token")
                .tokenType("Bearer")
                .expiresIn(System.currentTimeMillis() + 3600000)
                .user(userResponse)
                .build();

        when(authService.register(any(RegisterRequest.class))).thenReturn(authResponse);

        // Act & Assert
        // Jackson serialization: objectMapper.writeValueAsString(request) serializes to JSON
        // Jackson deserialization: controller receives JSON -> RegisterRequest
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").value("test-access-token"))
                .andExpect(jsonPath("$.refreshToken").value("test-refresh-token"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.email").value("newuser@test.com"))
                .andExpect(jsonPath("$.user.firstName").value("New"));
    }

    @Test
    @DisplayName("POST /api/auth/register — invalid email should return 400")
    void register_InvalidEmail_Returns400() throws Exception {
        // Arrange — missing @ symbol in email
        RegisterRequest request = RegisterRequest.builder()
                .email("invalid-email")
                .password("password123")
                .firstName("Test")
                .lastName("User")
                .build();

        // Act & Assert — Jackson serialization/deserialization still works,
        // but validation catches the bad email
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Validation Failed"))
                .andExpect(jsonPath("$.errors.email").exists());
    }

    @Test
    @DisplayName("POST /api/auth/login — should return 200 with auth tokens")
    void login_ValidCredentials_Returns200() throws Exception {
        // Arrange
        LoginRequest request = LoginRequest.builder()
                .email("test@example.com")
                .password("password123")
                .build();

        UserResponse userResponse = UserResponse.builder()
                .id(1L)
                .email("test@example.com")
                .firstName("Test")
                .lastName("User")
                .role("PATIENT")
                .build();

        AuthResponse authResponse = AuthResponse.builder()
                .accessToken("login-access-token")
                .refreshToken("login-refresh-token")
                .tokenType("Bearer")
                .expiresIn(System.currentTimeMillis() + 3600000)
                .user(userResponse)
                .build();

        when(authService.login(any(LoginRequest.class))).thenReturn(authResponse);

        // Act & Assert
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("login-access-token"))
                .andExpect(jsonPath("$.user.email").value("test@example.com"));
    }
}
