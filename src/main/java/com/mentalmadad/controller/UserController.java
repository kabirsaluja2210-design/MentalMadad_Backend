package com.mentalmadad.controller;

import com.mentalmadad.dto.response.UserResponse;
import com.mentalmadad.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * User profile REST controller.
 *
 * Design Notes:
 * - SOLID DIP: Depends on UserService interface.
 * - All endpoints require authentication (JWT Bearer token).
 * - Jackson serialization: UserResponse is serialized to JSON.
 * - The authenticated user's email is extracted from the SecurityContext
 *   to ensure users can only access their own profile.
 */
@RestController
@RequestMapping("/api/users")
@Tag(name = "Users", description = "User profile management")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    /**
     * Get the currently authenticated user's profile.
     * GET /api/users/me
     *
     * Requires a valid JWT Bearer token in the Authorization header.
     */
    @GetMapping("/me")
    @Operation(
            summary = "Get current user profile",
            security = @SecurityRequirement(name = "Bearer Authentication")
    )
    public ResponseEntity<UserResponse> getCurrentUser(Authentication authentication) {
        String email = authentication.getName();
        UserResponse response = userService.getCurrentUser(email);
        return ResponseEntity.ok(response);
    }
}
