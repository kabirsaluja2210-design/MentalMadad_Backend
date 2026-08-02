package com.mentalmadad.service.impl;

import com.mentalmadad.dto.request.LoginRequest;
import com.mentalmadad.dto.request.RefreshTokenRequest;
import com.mentalmadad.dto.request.RegisterRequest;
import com.mentalmadad.dto.response.AuthResponse;
import com.mentalmadad.dto.response.UserResponse;
import com.mentalmadad.entity.User;
import com.mentalmadad.entity.enums.Role;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.mapper.UserMapper;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.security.JwtProvider;
import com.mentalmadad.service.AuthService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Authentication service implementation.
 *
 * Design Notes:
 *
 * GoF Facade:
 * AuthService acts as a facade over multiple security subsystems:
 * - Password encoding (PasswordEncoder)
 * - Token generation (JwtProvider)
 * - User persistence (UserRepository)
 * - User mapping (UserMapper)
 * Controllers interact with this single facade instead of orchestrating
 * all these components themselves.
 *
 * GoF Factory Method:
 * The createUser() method is a factory method that constructs different
 * User entities based on the requested role. This centralizes creation
 * logic and can be extended for role-specific initialization.
 *
 * GoF Proxy (@Transactional):
 * Spring's @Transactional annotation creates a proxy around this service.
 * The proxy manages transaction boundaries (begin/commit/rollback)
 * transparently — the service code doesn't handle transactions at all.
 *
 * SOLID SRP: This class handles ONLY authentication (register, login, refresh).
 * User profile operations are in UserServiceImpl.
 *
 * SOLID DIP: Implements AuthService interface; controllers depend on the
 * interface, not this concrete class.
 */
@Service
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final JwtProvider jwtProvider;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;

    public AuthServiceImpl(UserRepository userRepository,
                           JwtProvider jwtProvider,
                           PasswordEncoder passwordEncoder,
                           UserMapper userMapper) {
        this.userRepository = userRepository;
        this.jwtProvider = jwtProvider;
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
    }

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        // Check for duplicate email
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered: " + request.getEmail());
        }

        // GoF Factory Method: Create user with role-specific initialization
        User user = createUser(request);

        // Encode password before persisting
        user.setPassword(passwordEncoder.encode(request.getPassword()));

        User savedUser = userRepository.save(user);

        // Generate tokens
        String accessToken = jwtProvider.generateAccessToken(savedUser.getEmail());
        String refreshToken = jwtProvider.generateRefreshToken(savedUser.getEmail());

        UserResponse userResponse = userMapper.toResponse(savedUser);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProvider.getExpirationFromToken(accessToken).getTime())
                .user(userResponse)
                .build();
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BadCredentialsException("Invalid email or password");
        }

        String accessToken = jwtProvider.generateAccessToken(user.getEmail());
        String refreshToken = jwtProvider.generateRefreshToken(user.getEmail());

        UserResponse userResponse = userMapper.toResponse(user);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProvider.getExpirationFromToken(accessToken).getTime())
                .user(userResponse)
                .build();
    }

    @Override
    public AuthResponse refreshToken(RefreshTokenRequest request) {
        String refreshToken = request.getRefreshToken();

        if (!jwtProvider.validateToken(refreshToken)) {
            throw new BadRequestException("Invalid or expired refresh token");
        }

        String email = jwtProvider.getEmailFromToken(refreshToken);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadRequestException("User not found for token"));

        String newAccessToken = jwtProvider.generateAccessToken(user.getEmail());
        String newRefreshToken = jwtProvider.generateRefreshToken(user.getEmail());

        UserResponse userResponse = userMapper.toResponse(user);

        return AuthResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProvider.getExpirationFromToken(newAccessToken).getTime())
                .user(userResponse)
                .build();
    }

    /**
     * GoF Factory Method:
     * Creates a User entity based on the role specified in the registration request.
     * Each role could have different initialization logic (e.g., PSYCHOLOGIST
     * might need license verification fields in the future).
     *
     * This method centralizes user creation — new role-specific initialization
     * can be added here without changing the register() method.
     */
    private User createUser(RegisterRequest request) {
        Role role = request.getRole() != null ? request.getRole() : Role.PATIENT;

        // GoF Builder pattern (via Lombok @Builder):
        return User.builder()
                .email(request.getEmail())
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .phoneNumber(request.getPhoneNumber())
                .role(role)
                .emailVerified(false) // Email verification would be a separate flow
                .build();
    }
}
