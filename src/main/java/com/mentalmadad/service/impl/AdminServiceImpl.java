package com.mentalmadad.service.impl;
import com.mentalmadad.dto.response.AdminStatsResponse; import com.mentalmadad.dto.response.AdminUserResponse; import com.mentalmadad.entity.User; import com.mentalmadad.entity.enums.AppointmentStatus; import com.mentalmadad.entity.enums.Role; import com.mentalmadad.repository.AppointmentRepository; import com.mentalmadad.repository.DoctorRepository; import com.mentalmadad.repository.UserRepository; import com.mentalmadad.service.AdminService; import org.springframework.data.domain.*; import org.springframework.stereotype.Service; import org.springframework.transaction.annotation.Transactional;
import java.util.EnumMap; import java.util.Map;
/**
 * Admin dashboard service implementation.
 *
 * Design Notes:
 * - SOLID SRP: Owns the admin-facing read models (user list, platform stats).
 *   Role enforcement is the controller/@PreAuthorize's job; this service is
 *   deliberately write-free (no mutation endpoints yet).
 * - Security: listUsers maps every User through AdminUserResponse — an
 *   explicit projection that contains no password/hash field, so admin
 *   listing can never leak credentials even if the entity changes.
 * - EnumMap for appointmentsByStatus keeps the map keyed by the enum's
 *   natural order for stable JSON output.
 */
@Service
public class AdminServiceImpl implements AdminService {
    private final UserRepository userRepository;
    private final DoctorRepository doctorRepository;
    private final AppointmentRepository appointmentRepository;

    public AdminServiceImpl(UserRepository userRepository, DoctorRepository doctorRepository,
                            AppointmentRepository appointmentRepository) {
        this.userRepository = userRepository;
        this.doctorRepository = doctorRepository;
        this.appointmentRepository = appointmentRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<AdminUserResponse> listUsers(int page, int size, Role role) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<User> users = (role == null)
                ? userRepository.findAll(pageable)
                : userRepository.findByRole(role, pageable);
        return users.map(this::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public AdminStatsResponse getStats() {
        Map<AppointmentStatus, Long> byStatus = new EnumMap<>(AppointmentStatus.class);
        for (Object[] row : appointmentRepository.countByStatusGrouped()) {
            byStatus.put((AppointmentStatus) row[0], (Long) row[1]);
        }
        return AdminStatsResponse.builder()
                .totalUsers(userRepository.count())
                .totalDoctors(doctorRepository.count())
                .totalAppointments(appointmentRepository.count())
                .appointmentsByStatus(byStatus)
                .build();
    }

    private AdminUserResponse toResponse(User u) {
        return AdminUserResponse.builder()
                .id(u.getId())
                .email(u.getEmail())
                .firstName(u.getFirstName())
                .lastName(u.getLastName())
                .role(u.getRole().name())
                .emailVerified(u.isEmailVerified())
                .createdAt(u.getCreatedAt())
                .build();
    }
}
