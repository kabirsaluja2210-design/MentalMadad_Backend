package com.mentalmadad.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO returned after successful authentication (login or register).
 *
 * Jackson serialization: This object is serialized to JSON by Spring's
 * HttpMessageConverter (Jackson). All getters produce JSON fields.
 * @JsonProperty customizes key names (e.g., camelCase -> snake_case if desired).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    @JsonProperty("accessToken")
    private String accessToken;

    @JsonProperty("refreshToken")
    private String refreshToken;

    @JsonProperty("tokenType")
    @Builder.Default
    private String tokenType = "Bearer";

    @JsonProperty("expiresIn")
    private long expiresIn;

    @JsonProperty("user")
    private UserResponse user;
}
