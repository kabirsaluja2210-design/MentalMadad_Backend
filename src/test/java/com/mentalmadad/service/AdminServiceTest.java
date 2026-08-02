package com.mentalmadad.service;

import com.mentalmadad.dto.response.AdminStatsResponse;
import com.mentalmadad.dto.response.AdminUserResponse;
import com.mentalmadad.entity.User;
import com.mentalmadad.entity.enums.AppointmentStatus;
import com.mentalmadad.entity.enums.Role;
import com.mentalmadad.repository.AppointmentRepository;
import com.mentalmadad.repository.DoctorRepository;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.service.impl.AdminServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for AdminServiceImpl dashboard read models.
 *
 * Covers: paginated user listing (with and without the role filter) and the
 * platform stats counts (users/doctors/appointments + by-status breakdown).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AdminService Unit Tests")
class AdminServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private AppointmentRepository appointmentRepository;

    @InjectMocks
    private AdminServiceImpl adminService;

    private User user(Long id, String email, Role role) {
        return User.builder()
                .id(id).email(email).firstName("First").lastName("Last")
                .role(role).emailVerified(true)
                .build();
    }

    @Test
    @DisplayName("GET users — paginates all users when no role filter is given")
    void listUsers_NoRole_ReturnsPagedAllUsers() {
        Page<User> page = new PageImpl<>(
                List.of(user(1L, "a@test.com", Role.PATIENT), user(2L, "b@test.com", Role.ADMIN)),
                Pageable.ofSize(20), 2);
        when(userRepository.findAll(any(Pageable.class))).thenReturn(page);

        Page<AdminUserResponse> result = adminService.listUsers(0, 20, null);

        assertEquals(2, result.getTotalElements());
        AdminUserResponse first = result.getContent().get(0);
        assertEquals(1L, first.getId());
        assertEquals("a@test.com", first.getEmail());
        assertEquals("PATIENT", first.getRole());
        assertTrue(first.isEmailVerified());
        // the admin projection must never expose a password hash field
        assertNull(getPasswordField(first));
        verify(userRepository).findAll(any(Pageable.class));
        verify(userRepository, never()).findByRole(any(), any());
    }

    @Test
    @DisplayName("GET users — filters by role when one is provided")
    void listUsers_WithRole_FiltersByRole() {
        Page<User> page = new PageImpl<>(
                List.of(user(1L, "ngo@test.com", Role.NGO)),
                Pageable.ofSize(20), 1);
        when(userRepository.findByRole(eq(Role.NGO), any(Pageable.class))).thenReturn(page);

        Page<AdminUserResponse> result = adminService.listUsers(0, 20, Role.NGO);

        assertEquals(1, result.getTotalElements());
        assertEquals("NGO", result.getContent().get(0).getRole());
        assertEquals("ngo@test.com", result.getContent().get(0).getEmail());
        verify(userRepository).findByRole(eq(Role.NGO), any(Pageable.class));
    }

    @Test
    @DisplayName("GET stats — returns real counts plus appointments-by-status breakdown")
    void getStats_ReturnsCounts() {
        when(userRepository.count()).thenReturn(10L);
        when(doctorRepository.count()).thenReturn(3L);
        when(appointmentRepository.count()).thenReturn(7L);
        when(appointmentRepository.countByStatusGrouped()).thenReturn(List.of(
                new Object[]{AppointmentStatus.SCHEDULED, 5L},
                new Object[]{AppointmentStatus.CANCELLED, 2L}
        ));

        AdminStatsResponse stats = adminService.getStats();

        assertEquals(10L, stats.getTotalUsers());
        assertEquals(3L, stats.getTotalDoctors());
        assertEquals(7L, stats.getTotalAppointments());
        Map<AppointmentStatus, Long> byStatus = stats.getAppointmentsByStatus();
        assertEquals(5L, byStatus.get(AppointmentStatus.SCHEDULED));
        assertEquals(2L, byStatus.get(AppointmentStatus.CANCELLED));
        assertEquals(2, byStatus.size());
        verify(appointmentRepository).countByStatusGrouped();
    }

    /** Reflection helper proving the admin DTO carries no password/hash field. */
    private Object getPasswordField(AdminUserResponse dto) {
        for (java.lang.reflect.Field f : dto.getClass().getDeclaredFields()) {
            String name = f.getName().toLowerCase();
            if (name.contains("password") || name.contains("hash")) {
                try {
                    f.setAccessible(true);
                    return f.get(dto);
                } catch (IllegalAccessException e) {
                    return "unreadable";
                }
            }
        }
        return null;
    }
}
