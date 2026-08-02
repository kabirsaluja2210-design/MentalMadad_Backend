package com.mentalmadad.service;

import com.mentalmadad.dto.request.AppointmentRequest;
import com.mentalmadad.dto.response.AppointmentResponse;
import com.mentalmadad.dto.response.AvailabilitySlot;
import com.mentalmadad.entity.Appointment;
import com.mentalmadad.entity.Doctor;
import com.mentalmadad.entity.User;
import com.mentalmadad.entity.enums.AppointmentStatus;
import com.mentalmadad.entity.enums.AppointmentType;
import com.mentalmadad.entity.enums.Role;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.repository.AppointmentRepository;
import com.mentalmadad.repository.DoctorRepository;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.service.impl.AppointmentServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for AppointmentServiceImpl.
 * Covers: successful booking, overlapping slot rejection, past-date
 * rejection, end-before-start rejection, cancel by owner/non-owner,
 * reschedule by owner/non-owner, availability filtering.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AppointmentService Unit Tests")
class AppointmentServiceTest {

    @Mock
    private AppointmentRepository appointmentRepository;

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AppointmentServiceImpl appointmentService;

    private User patient;
    private User doctorUser;
    private Doctor doctor;
    private AppointmentRequest validRequest;

    @BeforeEach
    void setUp() {
        patient = User.builder()
                .id(2L).email("patient@test.com").firstName("John").lastName("Doe")
                .role(Role.PATIENT).emailVerified(true).build();

        doctorUser = User.builder()
                .id(3L).email("psychologist@test.com").firstName("Jane").lastName("Smith")
                .role(Role.PSYCHOLOGIST).emailVerified(true).build();

        doctor = Doctor.builder()
                .id(1L).user(doctorUser).specialization("Clinical Psychology")
                .licenseNumber("LIC-PSY-1001").yearsOfExperience(8)
                .consultationFee(new BigDecimal("1500.00"))
                .about("Licensed clinical psychologist")
                .build();

        validRequest = new AppointmentRequest();
        validRequest.setDoctorId(1L);
        validRequest.setAppointmentDate(LocalDate.now().plusDays(7));
        validRequest.setStartTime(LocalTime.of(10, 0));
        validRequest.setEndTime(LocalTime.of(11, 0));
        validRequest.setType(AppointmentType.VIDEO);
        validRequest.setNotes("First session");
    }

    private Appointment existingAppointment(Long id, LocalTime start, LocalTime end,
                                            AppointmentStatus status) {
        return Appointment.builder()
                .id(id).patient(patient).doctor(doctor)
                .appointmentDate(LocalDate.now().plusDays(7))
                .startTime(start).endTime(end)
                .type(AppointmentType.VIDEO).status(status)
                .build();
    }

    @Test
    @DisplayName("Should book a new appointment with SCHEDULED status")
    void book_ValidRequest_ReturnsScheduledAppointment() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(patient));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        when(appointmentRepository.findByDoctorIdAndAppointmentDateOrderByStartTimeAsc(
                anyLong(), any(LocalDate.class))).thenReturn(Collections.emptyList());
        when(appointmentRepository.save(any(Appointment.class))).thenAnswer(inv -> {
            Appointment a = inv.getArgument(0);
            a.setId(100L);
            return a;
        });

        AppointmentResponse response = appointmentService.book(2L, validRequest);

        assertNotNull(response);
        assertEquals(100L, response.getId());
        assertEquals(AppointmentStatus.SCHEDULED, response.getStatus());
        assertEquals(1L, response.getDoctorId());
        assertEquals(2L, response.getPatientId());
        assertEquals("Jane Smith", response.getDoctorName());
        assertEquals("John Doe", response.getPatientName());
        assertEquals(validRequest.getAppointmentDate(), response.getAppointmentDate());
        assertEquals(LocalTime.of(10, 0), response.getStartTime());
        assertEquals(LocalTime.of(11, 0), response.getEndTime());
        verify(appointmentRepository).save(any(Appointment.class));
    }

    @Test
    @DisplayName("Should reject booking when the slot overlaps an existing appointment")
    void book_OverlappingSlot_ThrowsBadRequestException() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(patient));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        when(appointmentRepository.findByDoctorIdAndAppointmentDateOrderByStartTimeAsc(
                anyLong(), any(LocalDate.class)))
                .thenReturn(List.of(existingAppointment(5L,
                        LocalTime.of(9, 30), LocalTime.of(10, 30),
                        AppointmentStatus.SCHEDULED)));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> appointmentService.book(2L, validRequest));
        assertTrue(ex.getMessage().contains("already has an appointment"));
        verify(appointmentRepository, never()).save(any(Appointment.class));
    }

    @Test
    @DisplayName("Should reject booking on a past date")
    void book_PastDate_ThrowsBadRequestException() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(patient));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        validRequest.setAppointmentDate(LocalDate.now().minusDays(1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> appointmentService.book(2L, validRequest));
        assertTrue(ex.getMessage().contains("cannot be in the past"));
        verify(appointmentRepository, never()).save(any(Appointment.class));
    }

    @Test
    @DisplayName("Should reject booking when end time is before start time")
    void book_EndBeforeStart_ThrowsBadRequestException() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(patient));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        validRequest.setStartTime(LocalTime.of(11, 0));
        validRequest.setEndTime(LocalTime.of(10, 0));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> appointmentService.book(2L, validRequest));
        assertTrue(ex.getMessage().contains("End time must be after start time"));
        verify(appointmentRepository, never()).save(any(Appointment.class));
    }

    @Test
    @DisplayName("Should cancel an appointment when called by the owning patient")
    void cancel_OwnPatient_SetsCancelled() {
        Appointment appointment = existingAppointment(5L,
                LocalTime.of(10, 0), LocalTime.of(11, 0), AppointmentStatus.SCHEDULED);
        when(appointmentRepository.findById(5L)).thenReturn(Optional.of(appointment));
        when(appointmentRepository.save(any(Appointment.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        AppointmentResponse response = appointmentService.cancel(2L, 5L);

        assertEquals(AppointmentStatus.CANCELLED, response.getStatus());
        assertEquals(AppointmentStatus.CANCELLED, appointment.getStatus());
        verify(appointmentRepository).save(appointment);
    }

    @Test
    @DisplayName("Should reject cancellation by a user who is neither patient nor doctor")
    void cancel_NotOwner_ThrowsBadRequestException() {
        Appointment appointment = existingAppointment(5L,
                LocalTime.of(10, 0), LocalTime.of(11, 0), AppointmentStatus.SCHEDULED);
        when(appointmentRepository.findById(5L)).thenReturn(Optional.of(appointment));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> appointmentService.cancel(99L, 5L));
        assertTrue(ex.getMessage().contains("not allowed"));
        verify(appointmentRepository, never()).save(any(Appointment.class));
    }

    @Test
    @DisplayName("Should reschedule an appointment owned by the patient")
    void reschedule_OwnPatient_UpdatesSlot() {
        Appointment appointment = existingAppointment(5L,
                LocalTime.of(10, 0), LocalTime.of(11, 0), AppointmentStatus.SCHEDULED);
        when(appointmentRepository.findById(5L)).thenReturn(Optional.of(appointment));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        when(appointmentRepository.findByDoctorIdAndAppointmentDateOrderByStartTimeAsc(
                anyLong(), any(LocalDate.class))).thenReturn(Collections.emptyList());
        when(appointmentRepository.save(any(Appointment.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        validRequest.setStartTime(LocalTime.of(15, 0));
        validRequest.setEndTime(LocalTime.of(16, 0));

        AppointmentResponse response = appointmentService.reschedule(2L, 5L, validRequest);

        assertEquals(LocalTime.of(15, 0), response.getStartTime());
        assertEquals(LocalTime.of(16, 0), response.getEndTime());
        assertEquals(AppointmentStatus.SCHEDULED, response.getStatus());
        assertEquals(LocalTime.of(15, 0), appointment.getStartTime());
    }

    @Test
    @DisplayName("Should reject reschedule by a user who is not the owning patient")
    void reschedule_NotOwner_ThrowsBadRequestException() {
        Appointment appointment = existingAppointment(5L,
                LocalTime.of(10, 0), LocalTime.of(11, 0), AppointmentStatus.SCHEDULED);
        when(appointmentRepository.findById(5L)).thenReturn(Optional.of(appointment));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> appointmentService.reschedule(99L, 5L, validRequest));
        assertTrue(ex.getMessage().contains("own appointments"));
        verify(appointmentRepository, never()).save(any(Appointment.class));
    }

    @Test
    @DisplayName("Should return booked slots for a doctor and date, excluding cancelled")
    void availability_DoctorAndDate_ReturnsBusySlots() {
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        when(appointmentRepository.findByDoctorIdAndAppointmentDateOrderByStartTimeAsc(
                eq(1L), any(LocalDate.class)))
                .thenReturn(List.of(
                        existingAppointment(5L, LocalTime.of(9, 0), LocalTime.of(10, 0),
                                AppointmentStatus.CONFIRMED),
                        existingAppointment(6L, LocalTime.of(14, 0), LocalTime.of(15, 0),
                                AppointmentStatus.CANCELLED)));

        List<AvailabilitySlot> slots =
                appointmentService.getDoctorAvailability(1L, LocalDate.now().plusDays(7));

        assertEquals(1, slots.size());
        assertEquals(5L, slots.get(0).getAppointmentId());
        assertEquals(LocalTime.of(9, 0), slots.get(0).getStartTime());
    }
}
