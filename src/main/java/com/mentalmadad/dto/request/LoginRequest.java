package com.mentalmadad.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for login requests.
 * Jackson deserialization: Automatically deserialized from the JSON body
 * of POST /api/auth/login. Field names map to JSON keys directly.
 *
 * SOLID ISP: Separate from RegisterRequest — login only needs email+password.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @NotBlank(message = "Password is required")
    private String password;
}
