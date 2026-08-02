package com.mentalmadad.entity;

import com.mentalmadad.entity.enums.Role;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * User entity — the core domain object for the MentalMadad platform.
 *
 * Design Notes:
 * - GoF Builder: The @Builder annotation from Lombok implements the Builder
 *   pattern, allowing fluent construction of User objects without telescoping
 *   constructors.
 *
 * - Jackson Serialization:
 *   - @JsonIgnore on password prevents it from being serialized in responses
 *   - @JsonFormat on timestamps controls ISO 8601 format in JSON
 *   - Role enum is serialized as its string name by default
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    /**
     * Password stored as BCrypt hash.
     * @com.fasterxml.jackson.annotation.JsonIgnore prevents this field
     * from being included in any JSON response — critical security measure.
     */
    @Column(nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private String password;

    @Column(name = "first_name", nullable = false, length = 100)
    @com.fasterxml.jackson.annotation.JsonProperty("firstName")
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    @com.fasterxml.jackson.annotation.JsonProperty("lastName")
    private String lastName;

    /**
     * User role — stored as a string in the database.
     * Jackson serializes enums as their name() by default.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(name = "phone_number", length = 20)
    @com.fasterxml.jackson.annotation.JsonProperty("phoneNumber")
    private String phoneNumber;

    @Column(name = "email_verified", nullable = false)
    @com.fasterxml.jackson.annotation.JsonProperty("emailVerified")
    @Builder.Default
    private boolean emailVerified = false;

    /**
     * Timestamp of entity creation. Automatically set by Hibernate.
     * @JsonFormat ensures ISO 8601 format in JSON responses.
     */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    @com.fasterxml.jackson.annotation.JsonFormat(shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    @com.fasterxml.jackson.annotation.JsonProperty("createdAt")
    private LocalDateTime createdAt;

    /**
     * Timestamp of last entity update. Automatically managed by Hibernate.
     */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    @com.fasterxml.jackson.annotation.JsonFormat(shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    @com.fasterxml.jackson.annotation.JsonProperty("updatedAt")
    private LocalDateTime updatedAt;
}
