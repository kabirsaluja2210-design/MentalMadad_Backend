package com.mentalmadad.dto.response;
import com.fasterxml.jackson.annotation.JsonFormat; import com.fasterxml.jackson.annotation.JsonProperty; import lombok.*; import java.time.LocalDateTime;
/**
 * Admin-facing user listing DTO — the admin dashboard user table row.
 *
 * Security note: this DTO deliberately carries NO password field and no
 * refresh-token material. Even though the User entity @JsonIgnores password,
 * the admin list is built through this dedicated DTO so the projection is
 * explicit and impossible to widen accidentally.
 */
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class AdminUserResponse {
    private Long id;
    private String email;
    @JsonProperty("firstName") private String firstName;
    @JsonProperty("lastName") private String lastName;
    private String role;
    @JsonProperty("emailVerified") private boolean emailVerified;
    @JsonProperty("createdAt") @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;
}
