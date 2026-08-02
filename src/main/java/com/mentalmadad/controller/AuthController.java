package com.mentalmadad.controller;

import com.mentalmadad.dto.request.LoginRequest;
import com.mentalmadad.dto.request.RefreshTokenRequest;
import com.mentalmadad.dto.request.RegisterRequest;
import com.mentalmadad.dto.response.AuthResponse;
import com.mentalmadad.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Authentication REST controller.
 *
 * Design Notes:
 * - SOLID DIP: Depends on AuthService interface, not AuthServiceImpl.
 *   The concrete implementation is injected by Spring IoC container.
 * - Jackson deserialization: @RequestBody triggers Jackson to deserialize
 *   the incoming JSON into RegisterRequest, LoginRequest, or RefreshTokenRequest DTOs.
 * - Jackson serialization: Returned AuthResponse is automatically serialized
 *   to JSON by Spring's HttpMessageConverter.
 * - @Valid triggers Bean Validation (jakarta.validation) before the method body runs.
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Registration, login, and token management")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * Register a new user.
     * POST /api/auth/register
     *
     * Jackson deserialization: The JSON body is deserialized into RegisterRequest.
     * Example request body:
     * {
     *   "email": "newuser@test.com",
     *   "password": "password123",
     *   "firstName": "Test",
     *   "lastName": "User",
     *   "phoneNumber": "+1234567890"
     * }
     */
    @PostMapping("/register")
    @Operation(summary = "Register a new user account")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Login with email and password.
     * POST /api/auth/login
     *
     * Jackson deserialization: JSON body -> LoginRequest.
     */
    @PostMapping("/login")
    @Operation(summary = "Login with email and password")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    /**
     * Refresh an expired access token.
     * POST /api/auth/refresh
     *
     * Jackson deserialization: JSON body -> RefreshTokenRequest.
     */
    @PostMapping("/refresh")
    @Operation(summary = "Refresh access token using refresh token")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        AuthResponse response = authService.refreshToken(request);
        return ResponseEntity.ok(response);
    }
}
