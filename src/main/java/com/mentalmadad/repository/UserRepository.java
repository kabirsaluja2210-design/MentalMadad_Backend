package com.mentalmadad.repository;

import com.mentalmadad.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Spring Data JPA repository for User entity.
 *
 * Design Notes:
 * - GoF Proxy: Spring Data JPA creates a proxy implementation at runtime
 *   that handles all the boilerplate CRUD and query method execution.
 * - This interface follows SOLID ISP — it only exposes User-specific queries.
 * - Spring beans are Singletons (GoF) by default.
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Find a user by email — used during authentication.
     */
    Optional<User> findByEmail(String email);

    /**
     * Check if an email already exists — used during registration validation.
     */
    boolean existsByEmail(String email);
}
