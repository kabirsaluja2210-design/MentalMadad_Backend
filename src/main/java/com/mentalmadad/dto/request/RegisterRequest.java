package com.mentalmadad.dto.request;

import com.mentalmadad.entity.enums.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for user registration requests.
 * Jackson deserialization: @RequestBody in the controller deserializes
 * the incoming JSON payload into this DTO automatically.
 *
 * Design Notes:
 * - GoF Builder: @Builder provides fluent construction for tests and utilities
 * - SOLID ISP: This DTO is specific to registration — separate from LoginRequest
 * - Jackson: All fields are deserialized from camelCase JSON keys matching field names
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String password;

    @NotBlank(message = "First name is required")
    private String firstName;

    @NotBlank(message = "Last name is required")
    private String lastName;

    private String phoneNumber;

    /**
     * Default role for self-registration is PATIENT.
     * Admins can override via a separate admin endpoint.
     */
    @Builder.Default
    private Role role = Role.PATIENT;
}
