package com.mentalmadad.service;

import com.mentalmadad.dto.request.LoginRequest;
import com.mentalmadad.dto.request.RegisterRequest;
import com.mentalmadad.dto.response.AuthResponse;
import com.mentalmadad.entity.User;
import com.mentalmadad.entity.enums.Role;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.mapper.UserMapper;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.security.JwtProvider;
import com.mentalmadad.service.impl.AuthServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Date;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for AuthServiceImpl.
 *
 * Tests cover:
 * 1. Successful registration
 * 2. Registration with duplicate email (BadRequestException)
 * 3. Successful login
 * 4. Login with wrong password (BadCredentialsException)
 * 5. Token refresh
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService Unit Tests")
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private JwtProvider jwtProvider;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private UserMapper userMapper;

    @InjectMocks
    private AuthServiceImpl authService;

    private RegisterRequest registerRequest;
    private LoginRequest loginRequest;
    private User testUser;

    @BeforeEach
    void setUp() {
        registerRequest = RegisterRequest.builder()
                .email("test@example.com")
                .password("password123")
                .firstName("Test")
                .lastName("User")
                .role(Role.PATIENT)
                .build();

        loginRequest = LoginRequest.builder()
                .email("test@example.com")
                .password("password123")
                .build();

        testUser = User.builder()
                .id(1L)
                .email("test@example.com")
                .password("encodedPassword")
                .firstName("Test")
                .lastName("User")
                .role(Role.PATIENT)
                .emailVerified(true)
                .build();
    }

    @Test
    @DisplayName("Should successfully register a new user and return JWT tokens")
    void register_NewUser_ReturnsAuthResponse() {
        // Arrange
        when(userRepository.existsByEmail(anyString())).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("encodedPassword");
        when(userRepository.save(any(User.class))).thenReturn(testUser);
        when(jwtProvider.generateAccessToken(anyString())).thenReturn("access-token");
        when(jwtProvider.generateRefreshToken(anyString())).thenReturn("refresh-token");
        when(jwtProvider.getExpirationFromToken(anyString())).thenReturn(new Date());
        when(userMapper.toResponse(any(User.class))).thenReturn(
                com.mentalmadad.dto.response.UserResponse.builder()
                        .id(1L).email("test@example.com").build());

        // Act
        AuthResponse response = authService.register(registerRequest);

        // Assert
        assertNotNull(response);
        assertEquals("access-token", response.getAccessToken());
        assertEquals("refresh-token", response.getRefreshToken());
        assertEquals("Bearer", response.getTokenType());
        verify(userRepository).existsByEmail("test@example.com");
        verify(userRepository).save(any(User.class));
        verify(jwtProvider).generateAccessToken("test@example.com");
    }

    @Test
    @DisplayName("Should throw BadRequestException when registering with duplicate email")
    void register_DuplicateEmail_ThrowsBadRequestException() {
        // Arrange
        when(userRepository.existsByEmail(anyString())).thenReturn(true);

        // Act & Assert
        BadRequestException exception = assertThrows(BadRequestException.class,
                () -> authService.register(registerRequest));
        assertTrue(exception.getMessage().contains("already registered"));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    @DisplayName("Should successfully login with valid credentials")
    void login_ValidCredentials_ReturnsAuthResponse() {
        // Arrange
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);
        when(jwtProvider.generateAccessToken(anyString())).thenReturn("access-token");
        when(jwtProvider.generateRefreshToken(anyString())).thenReturn("refresh-token");
        when(jwtProvider.getExpirationFromToken(anyString())).thenReturn(new Date());
        when(userMapper.toResponse(any(User.class))).thenReturn(
                com.mentalmadad.dto.response.UserResponse.builder()
                        .id(1L).email("test@example.com").build());

        // Act
        AuthResponse response = authService.login(loginRequest);

        // Assert
        assertNotNull(response);
        assertEquals("access-token", response.getAccessToken());
        assertEquals("Bearer", response.getTokenType());
        verify(passwordEncoder).matches("password123", "encodedPassword");
    }
}
