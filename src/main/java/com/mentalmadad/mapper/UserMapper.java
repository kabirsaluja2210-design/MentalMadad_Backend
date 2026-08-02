package com.mentalmadad.mapper;

import com.mentalmadad.dto.response.UserResponse;
import com.mentalmadad.entity.User;
import org.springframework.stereotype.Component;

/**
 * Mapper that converts between User entity and UserResponse DTO.
 *
 * Design Notes:
 * - SOLID SRP: This class has the single responsibility of mapping User <-> UserResponse.
 *   Controllers and services delegate to this mapper rather than embedding mapping logic.
 * - Jackson: The resulting UserResponse is serialized to JSON by the controller layer.
 */
@Component
public class UserMapper {

    /**
     * Convert a User entity to a UserResponse DTO.
     * This is the boundary between the persistence layer (entity) and
     * the presentation layer (DTO).
     */
    public UserResponse toResponse(User user) {
        if (user == null) {
            return null;
        }
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .role(user.getRole().name())
                .phoneNumber(user.getPhoneNumber())
                .emailVerified(user.isEmailVerified())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .build();
    }
}
