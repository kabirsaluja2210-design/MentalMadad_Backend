package com.mentalmadad.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * DTO for user data in API responses — separate from the User entity.
 *
 * SOLID SRP: This DTO is the presentation-layer representation of a user.
 * It deliberately excludes the password field (already @JsonIgnore'd on entity).
 *
 * Jackson serialization:
 * - @JsonProperty customizes JSON field names (camelCase)
 * - @JsonFormat ensures consistent ISO 8601 date formatting
 * - All non-null fields are serialized by default (Jackson default behavior)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {

    private Long id;

    private String email;

    @JsonProperty("firstName")
    private String firstName;

    @JsonProperty("lastName")
    private String lastName;

    private String role;

    @JsonProperty("phoneNumber")
    private String phoneNumber;

    @JsonProperty("emailVerified")
    private boolean emailVerified;

    @JsonProperty("createdAt")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;

    @JsonProperty("updatedAt")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime updatedAt;
}
