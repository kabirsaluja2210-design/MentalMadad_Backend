package com.mentalmadad.service;

import com.mentalmadad.dto.request.LoginRequest;
import com.mentalmadad.dto.request.RefreshTokenRequest;
import com.mentalmadad.dto.request.RegisterRequest;
import com.mentalmadad.dto.response.AuthResponse;

/**
 * Authentication service interface.
 *
 * SOLID ISP (Interface Segregation Principle):
 * This interface is specific to authentication concerns.
 * User profile operations go in UserService — clients that only need
 * auth don't depend on user-profile methods they never use.
 *
 * SOLID DIP (Dependency Inversion Principle):
 * Controllers depend on this interface (abstraction), not on AuthServiceImpl
 * (concrete implementation). This allows swapping implementations
 * (e.g., OAuth2-based auth) without changing controller code.
 */
public interface AuthService {

    /**
     * Register a new user account and return JWT tokens.
     */
    AuthResponse register(RegisterRequest request);

    /**
     * Authenticate with email + password and return JWT tokens.
     */
    AuthResponse login(LoginRequest request);

    /**
     * Refresh an expired access token using a valid refresh token.
     */
    AuthResponse refreshToken(RefreshTokenRequest request);
}
