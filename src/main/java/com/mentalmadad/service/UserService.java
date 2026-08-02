package com.mentalmadad.service;

import com.mentalmadad.dto.response.UserResponse;

/**
 * User profile service interface.
 *
 * SOLID ISP: Separate from AuthService — clients that only need profile
 * operations don't depend on auth methods.
 *
 * SOLID DIP: Controllers depend on this interface, not the implementation.
 */
public interface UserService {

    /**
     * Get the currently authenticated user's profile.
     */
    UserResponse getCurrentUser(String email);
}
