package com.mentalmadad.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

/**
 * JWT Provider — handles token generation, validation, and parsing.
 *
 * Design Notes:
 * - SOLID SRP: This class has the single responsibility of JWT operations.
 *   Authentication logic lives in AuthService (Facade pattern).
 * - GoF Singleton: Spring manages this as a singleton bean.
 * - Uses io.jsonwebtoken (jjwt) library for JWT operations.
 */
@Component
public class JwtProvider {

    private final SecretKey signingKey;
    private final long expirationMs;
    private final long refreshExpirationMs;

    public JwtProvider(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-ms}") long expirationMs,
            @Value("${app.jwt.refresh-expiration-ms}") long refreshExpirationMs) {
        this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(
                java.util.Base64.getEncoder().encodeToString(secret.getBytes())));
        this.expirationMs = expirationMs;
        this.refreshExpirationMs = refreshExpirationMs;
    }

    /**
     * Generate a short-lived access token for the given email.
     */
    public String generateAccessToken(String email) {
        return buildToken(email, expirationMs);
    }

    /**
     * Generate a long-lived refresh token for the given email.
     */
    public String generateRefreshToken(String email) {
        return buildToken(email, refreshExpirationMs);
    }

    /**
     * Extract the email (subject) from a JWT token.
     */
    public String getEmailFromToken(String token) {
        return parseClaims(token).getSubject();
    }

    /**
     * Validate a JWT token. Returns true if the token is well-formed and not expired.
     */
    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * Get the expiration time from a token.
     */
    public Date getExpirationFromToken(String token) {
        return parseClaims(token).getExpiration();
    }

    private String buildToken(String email, long expiration) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expiration);
        return Jwts.builder()
                .subject(email)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey)
                .compact();
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
