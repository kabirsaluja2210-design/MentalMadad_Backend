package com.mentalmadad.controller;

import com.mentalmadad.dto.request.AppointmentRequest;
import com.mentalmadad.dto.response.AppointmentResponse;
import com.mentalmadad.dto.response.AvailabilitySlot;
import com.mentalmadad.entity.enums.AppointmentStatus;
import com.mentalmadad.security.CustomUserDetails;
import com.mentalmadad.service.AppointmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Appointment REST controller.
 *
 * Design Notes:
 * - SOLID DIP: Depends on the AppointmentService interface only.
 * - ROLE CONTROL: Method-level @PreAuthorize (enabled by @EnableMethodSecurity
 *   in SecurityConfig) enforces role-based access:
 *     * PATIENT          -> book, reschedule, list own appointments
 *     * PSYCHOLOGIST / PSYCHIATRIST (the platform's provider roles, which
 *       back the "doctor" concept) -> own-calendar listing + cancellation
 *     * any authenticated user      -> availability lookup (read-only)
 *   The authenticated user's id is extracted from the JWT-derived
 *   CustomUserDetails principal, so all ownership checks happen in the
 *   service layer against the real authenticated identity.
 */
@RestController
@RequestMapping("/api/appointments")
@Tag(name = "Appointments", description = "Appointment booking, rescheduling, cancellation, and availability")
public class AppointmentController {

    private final AppointmentService appointmentService;

    public AppointmentController(AppointmentService appointmentService) {
        this.appointmentService = appointmentService;
    }

    private Long currentUserId(Authentication authentication) {
        CustomUserDetails principal = (CustomUserDetails) authentication.getPrincipal();
        return principal.getId();
    }

    @PostMapping
    @PreAuthorize("hasRole('PATIENT')")
    @Operation(summary = "Book a new appointment",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<AppointmentResponse> book(
            Authentication authentication,
            @Valid @RequestBody AppointmentRequest request) {
        AppointmentResponse response =
                appointmentService.book(currentUserId(authentication), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('PATIENT')")
    @Operation(summary = "Reschedule an appointment",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<AppointmentResponse> reschedule(
            Authentication authentication,
            @PathVariable Long id,
            @Valid @RequestBody AppointmentRequest request) {
        AppointmentResponse response =
                appointmentService.reschedule(currentUserId(authentication), id, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('PATIENT','PSYCHOLOGIST','PSYCHIATRIST')")
    @Operation(summary = "Cancel an appointment",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<AppointmentResponse> cancel(
            Authentication authentication, @PathVariable Long id) {
        AppointmentResponse response =
                appointmentService.cancel(currentUserId(authentication), id);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('PATIENT')")
    @Operation(summary = "List my appointments (optionally by status)",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<List<AppointmentResponse>> myAppointments(
            Authentication authentication,
            @RequestParam(required = false) AppointmentStatus status) {
        List<AppointmentResponse> response = (status == null)
                ? appointmentService.listMyAppointments(currentUserId(authentication))
                : appointmentService.listMyAppointmentsByStatus(
                        currentUserId(authentication), status);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/doctor/my")
    @PreAuthorize("hasAnyRole('PSYCHOLOGIST','PSYCHIATRIST')")
    @Operation(summary = "List appointments on my doctor calendar (optionally by status)",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<List<AppointmentResponse>> doctorAppointments(
            Authentication authentication,
            @RequestParam(required = false) AppointmentStatus status) {
        List<AppointmentResponse> response =
                appointmentService.listDoctorAppointments(
                        currentUserId(authentication), status);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/doctors/{doctorId}/availability")
    @Operation(summary = "Get booked slots for a doctor on a date")
    public ResponseEntity<List<AvailabilitySlot>> availability(
            @PathVariable Long doctorId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(
                appointmentService.getDoctorAvailability(doctorId, date));
    }
}
