package com.mentalmadad.security;

import com.mentalmadad.entity.User;
import com.mentalmadad.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Custom UserDetailsService — loads user from database during authentication.
 *
 * Design Notes:
 * - GoF Strategy: Spring Security uses this as one strategy in its authentication
 *   flow. This can be swapped (e.g., for OAuth2) without changing the filter chain.
 * - GoF Template Method: Spring Security's AuthenticationManager defines the
 *   template for authentication; this service fills in the user-loading step.
 * - GoF Singleton: @Service beans are singletons by default.
 */
@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException(
                        "User not found with email: " + email));
        return new CustomUserDetails(user);
    }
}
