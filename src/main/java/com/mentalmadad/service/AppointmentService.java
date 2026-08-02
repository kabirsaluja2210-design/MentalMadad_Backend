package com.mentalmadad.service;

import com.mentalmadad.dto.request.AppointmentRequest;
import com.mentalmadad.dto.response.AppointmentResponse;
import com.mentalmadad.dto.response.AvailabilitySlot;
import com.mentalmadad.entity.enums.AppointmentStatus;

import java.time.LocalDate;
import java.util.List;

/**
 * Appointment booking service interface.
 *
 * Design Notes:
 * - SOLID DIP: Controllers depend on this interface, never on the concrete
 *   implementation (AppointmentServiceImpl). Spring IoC wires the bean.
 * - SOLID ISP: This interface only exposes appointment operations — clients
 *   that need auth or doctor operations depend on their own interfaces.
 * - Every method receives the authenticated user's id (`userId`) so the
 *   service can enforce ownership rules (a patient can only touch their
 *   own appointments; a doctor only their own calendar).
 */
public interface AppointmentService {

    AppointmentResponse book(Long userId, AppointmentRequest request);

    AppointmentResponse reschedule(Long userId, Long appointmentId, AppointmentRequest request);

    AppointmentResponse cancel(Long userId, Long appointmentId);

    List<AppointmentResponse> listMyAppointments(Long userId);

    List<AppointmentResponse> listMyAppointmentsByStatus(Long userId, AppointmentStatus status);

    List<AvailabilitySlot> getDoctorAvailability(Long doctorId, LocalDate date);

    List<AppointmentResponse> listDoctorAppointments(Long userId, AppointmentStatus status);
}
