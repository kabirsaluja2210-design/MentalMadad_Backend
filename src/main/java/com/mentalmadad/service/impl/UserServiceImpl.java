package com.mentalmadad.service.impl;

import com.mentalmadad.dto.response.UserResponse;
import com.mentalmadad.entity.User;
import com.mentalmadad.exception.ResourceNotFoundException;
import com.mentalmadad.mapper.UserMapper;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.service.UserService;
import org.springframework.stereotype.Service;

/**
 * User profile service implementation.
 *
 * Design Notes:
 * - SOLID SRP: Handles ONLY user profile operations (get current user).
 *   Auth operations are in AuthServiceImpl.
 * - GoF Proxy (@Transactional): Read operations are wrapped in a read-only
 *   transaction for consistency and performance.
 * - GoF Singleton: Spring manages this as a singleton bean.
 */
@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;

    public UserServiceImpl(UserRepository userRepository, UserMapper userMapper) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
    }

    @Override
    public UserResponse getCurrentUser(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", email));
        return userMapper.toResponse(user);
    }
}
