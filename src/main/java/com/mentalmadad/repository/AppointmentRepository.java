package com.mentalmadad.repository;

import com.mentalmadad.entity.Appointment;
import com.mentalmadad.entity.enums.AppointmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

/**
 * Spring Data JPA repository for Appointment entity.
 *
 * Design Notes:
 * - GoF Proxy: Spring Data JPA implements these derived query methods at
 *   runtime from their method names.
 * - Query results are consistently ordered by appointment date then start
 *   time so the frontend can render calendars/lists without re-sorting.
 */
public interface AppointmentRepository extends JpaRepository<Appointment, Long> {

    List<Appointment> findByPatientIdOrderByAppointmentDateAscStartTimeAsc(Long patientId);

    List<Appointment> findByPatientIdAndStatusOrderByAppointmentDateAscStartTimeAsc(
            Long patientId, AppointmentStatus status);

    List<Appointment> findByDoctorIdAndAppointmentDateOrderByStartTimeAsc(
            Long doctorId, LocalDate appointmentDate);

    List<Appointment> findByDoctorIdOrderByAppointmentDateAscStartTimeAsc(Long doctorId);

    List<Appointment> findByDoctorIdAndStatusOrderByAppointmentDateAscStartTimeAsc(
            Long doctorId, AppointmentStatus status);

    /**
     * Appointment counts grouped by status (Object[] = {AppointmentStatus, Long})
     * — feeds the admin dashboard's appointments-by-status breakdown.
     */
    @Query("select a.status, count(a) from Appointment a group by a.status")
    List<Object[]> countByStatusGrouped();
}
