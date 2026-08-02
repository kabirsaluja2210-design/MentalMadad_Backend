package com.mentalmadad.config;

import com.mentalmadad.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security configuration.
 *
 * Design Notes:
 *
 * GoF Chain of Responsibility:
 * The SecurityFilterChain is the quintessential Chain of Responsibility
 * implementation. Each filter in the chain (JwtAuthenticationFilter,
 * UsernamePasswordAuthenticationFilter, etc.) processes the request
 * sequentially and can decide to pass it along or handle it.
 *
 * GoF Strategy:
 * Different authentication strategies (JWT, OAuth2) can be plugged in
 * by configuring different SecurityFilterChain beans. PasswordEncoder
 * is also a strategy — we use BCrypt, but could swap to Argon2.
 *
 * GoF Template Method:
 * Spring Security's AuthenticationManager defines the template for
 * authentication (authenticate()), while providers fill in the steps.
 *
 * GoF Singleton: All @Bean methods produce singleton beans.
 *
 * SOLID OCP (Open/Closed Principle):
 * New security rules (e.g., new public endpoints) can be added by
 * modifying the HttpSecurity configuration without changing existing
 * security logic.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    /**
     * Password encoder bean — BCrypt strategy.
     * GoF Strategy: Swap this bean to change the password hashing algorithm
     * without modifying any service code.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration authConfig) throws Exception {
        return authConfig.getAuthenticationManager();
    }

    /**
     * Security filter chain — the core of Spring Security.
     *
     * GoF Chain of Responsibility:
     * 1. Disable CSRF (API uses JWT, not cookies)
     * 2. Set stateless session (JWT-based, no server-side sessions)
     * 3. Permit all on auth endpoints, require auth elsewhere
     * 4. Add JWT filter BEFORE UsernamePasswordAuthenticationFilter
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> {}) // Enable CORS (uses CorsConfig bean)
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Public endpoints
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/doctors/**").permitAll()
                .requestMatchers("/swagger-ui/**", "/api-docs/**").permitAll()
                .requestMatchers("/h2-console/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                // AI assistant endpoints require authentication (JWT) like other protected routes
                .requestMatchers("/api/ai/**").authenticated()
                // Everything else requires authentication
                .anyRequest().authenticated()
            )
            // Add JWT filter before Spring's default auth filter
            .addFilterBefore(jwtAuthenticationFilter,
                    UsernamePasswordAuthenticationFilter.class);

        // Allow H2 console to be displayed in frames
        http.headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()));

        return http.build();
    }
}
