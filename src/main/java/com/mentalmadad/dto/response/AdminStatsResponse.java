package com.mentalmadad.dto.response;
import com.mentalmadad.entity.enums.AppointmentStatus; import lombok.*; import java.util.Map;
/**
 * Platform statistics for the admin dashboard — real numbers backed by
 * repository counts rather than placeholder figures.
 */
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class AdminStatsResponse {
    private long totalUsers;
    private long totalDoctors;
    private long totalAppointments;
    /** Appointment counts grouped by status (SCHEDULED, CONFIRMED, CANCELLED...). */
    private Map<AppointmentStatus, Long> appointmentsByStatus;
}
