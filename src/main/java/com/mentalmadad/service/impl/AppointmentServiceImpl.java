package com.mentalmadad.service.impl;

import com.mentalmadad.dto.request.AppointmentRequest;
import com.mentalmadad.dto.response.AppointmentResponse;
import com.mentalmadad.dto.response.AvailabilitySlot;
import com.mentalmadad.entity.Appointment;
import com.mentalmadad.entity.Doctor;
import com.mentalmadad.entity.User;
import com.mentalmadad.entity.enums.AppointmentStatus;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.exception.ResourceNotFoundException;
import com.mentalmadad.repository.AppointmentRepository;
import com.mentalmadad.repository.DoctorRepository;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.service.AppointmentService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * Appointment booking service implementation.
 *
 * Design Notes:
 * - SOLID SRP: This class owns ALL appointment business rules — slot
 *   validation, conflict detection, ownership checks, and status
 *   transitions. Controllers stay thin, entities stay anemic.
 * - SOLID DIP: Depends on repository abstractions (Spring Data interfaces)
 *   and the AppointmentService interface; no concrete dependencies.
 * - GoF Facade: Exposes a small, intent-revealing API (book/reschedule/
 *   cancel/list/availability) over the underlying repository operations.
 * - @Transactional (GoF Proxy): Spring wraps the bean in a transactional
 *   proxy so multi-step operations (e.g. check-then-save) run atomically
 *   and lazy associations can be initialized inside the transaction.
 */
@Service
public class AppointmentServiceImpl implements AppointmentService {

    private final AppointmentRepository appointmentRepository;
    private final DoctorRepository doctorRepository;
    private final UserRepository userRepository;

    public AppointmentServiceImpl(AppointmentRepository appointmentRepository,
                                  DoctorRepository doctorRepository,
                                  UserRepository userRepository) {
        this.appointmentRepository = appointmentRepository;
        this.doctorRepository = doctorRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional
    public AppointmentResponse book(Long userId, AppointmentRequest request) {
        User patient = getUser(userId);
        Doctor doctor = getDoctor(request.getDoctorId());
        validateTimeslot(request, null);

        Appointment appointment = Appointment.builder()
                .patient(patient)
                .doctor(doctor)
                .appointmentDate(request.getAppointmentDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .type(request.getType())
                .notes(request.getNotes())
                .status(AppointmentStatus.SCHEDULED)
                .build();

        return toResponse(appointmentRepository.save(appointment));
    }

    @Override
    @Transactional
    public AppointmentResponse reschedule(Long userId, Long appointmentId,
                                          AppointmentRequest request) {
        Appointment appointment = getAppointment(appointmentId);

        if (!appointment.getPatient().getId().equals(userId)) {
            throw new BadRequestException("You can only reschedule your own appointments");
        }
        requireRescheduleable(appointment);

        Doctor doctor = getDoctor(request.getDoctorId());
        validateTimeslot(request, appointmentId);

        appointment.setDoctor(doctor);
        appointment.setAppointmentDate(request.getAppointmentDate());
        appointment.setStartTime(request.getStartTime());
        appointment.setEndTime(request.getEndTime());
        appointment.setType(request.getType());
        appointment.setNotes(request.getNotes());

        return toResponse(appointmentRepository.save(appointment));
    }

    @Override
    @Transactional
    public AppointmentResponse cancel(Long userId, Long appointmentId) {
        Appointment appointment = getAppointment(appointmentId);

        boolean isPatient = appointment.getPatient().getId().equals(userId);
        boolean isOwningDoctor = appointment.getDoctor().getUser().getId().equals(userId);
        if (!isPatient && !isOwningDoctor) {
            throw new BadRequestException("You are not allowed to cancel this appointment");
        }
        requireRescheduleable(appointment);

        appointment.setStatus(AppointmentStatus.CANCELLED);
        return toResponse(appointmentRepository.save(appointment));
    }

    @Override
    @Transactional(readOnly = true)
    public List<AppointmentResponse> listMyAppointments(Long userId) {
        getUser(userId);
        return appointmentRepository
                .findByPatientIdOrderByAppointmentDateAscStartTimeAsc(userId)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AppointmentResponse> listMyAppointmentsByStatus(Long userId,
                                                                AppointmentStatus status) {
        getUser(userId);
        return appointmentRepository
                .findByPatientIdAndStatusOrderByAppointmentDateAscStartTimeAsc(userId, status)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AvailabilitySlot> getDoctorAvailability(Long doctorId, LocalDate date) {
        getDoctor(doctorId);
        return appointmentRepository
                .findByDoctorIdAndAppointmentDateOrderByStartTimeAsc(doctorId, date)
                .stream()
                .filter(a -> a.getStatus() != AppointmentStatus.CANCELLED)
                .map(this::toSlot)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AppointmentResponse> listDoctorAppointments(Long userId, AppointmentStatus status) {
        Doctor doctor = doctorRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Doctor profile", "userId", userId));
        List<Appointment> appointments = (status == null)
                ? appointmentRepository
                        .findByDoctorIdOrderByAppointmentDateAscStartTimeAsc(doctor.getId())
                : appointmentRepository
                        .findByDoctorIdAndStatusOrderByAppointmentDateAscStartTimeAsc(
                                doctor.getId(), status);
        return appointments.stream().map(this::toResponse).toList();
    }

    private void validateTimeslot(AppointmentRequest request, Long excludeAppointmentId) {
        LocalDate date = request.getAppointmentDate();

        if (date.isBefore(LocalDate.now())) {
            throw new BadRequestException("Appointment date cannot be in the past");
        }
        if (date.equals(LocalDate.now())
                && request.getStartTime().isBefore(LocalTime.now())) {
            throw new BadRequestException("Appointment start time cannot be in the past");
        }
        if (!request.getEndTime().isAfter(request.getStartTime())) {
            throw new BadRequestException("End time must be after start time");
        }

        for (Appointment existing : appointmentRepository
                .findByDoctorIdAndAppointmentDateOrderByStartTimeAsc(
                        request.getDoctorId(), date)) {
            if (existing.getStatus() == AppointmentStatus.CANCELLED) {
                continue;
            }
            if (excludeAppointmentId != null
                    && existing.getId().equals(excludeAppointmentId)) {
                continue;
            }
            boolean overlaps = existing.getStartTime().isBefore(request.getEndTime())
                    && request.getStartTime().isBefore(existing.getEndTime());
            if (overlaps) {
                throw new BadRequestException(
                        "The doctor already has an appointment in this time range");
            }
        }
    }

    private void requireRescheduleable(Appointment appointment) {
        AppointmentStatus s = appointment.getStatus();
        if (s != AppointmentStatus.SCHEDULED && s != AppointmentStatus.CONFIRMED) {
            throw new BadRequestException(
                    "Only SCHEDULED or CONFIRMED appointments can be rescheduled or cancelled");
        }
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
    }

    private Doctor getDoctor(Long doctorId) {
        return doctorRepository.findById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor", "id", doctorId));
    }

    private Appointment getAppointment(Long appointmentId) {
        return appointmentRepository.findById(appointmentId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Appointment", "id", appointmentId));
    }

    private AppointmentResponse toResponse(Appointment a) {
        return AppointmentResponse.builder()
                .id(a.getId())
                .doctorId(a.getDoctor().getId())
                .patientId(a.getPatient().getId())
                .doctorName(a.getDoctor().getUser().getFirstName() + " "
                        + a.getDoctor().getUser().getLastName())
                .patientName(a.getPatient().getFirstName() + " "
                        + a.getPatient().getLastName())
                .appointmentDate(a.getAppointmentDate())
                .startTime(a.getStartTime())
                .endTime(a.getEndTime())
                .type(a.getType())
                .status(a.getStatus())
                .notes(a.getNotes())
                .build();
    }

    private AvailabilitySlot toSlot(Appointment a) {
        return AvailabilitySlot.builder()
                .appointmentId(a.getId())
                .doctorId(a.getDoctor().getId())
                .date(a.getAppointmentDate())
                .startTime(a.getStartTime())
                .endTime(a.getEndTime())
                .status(a.getStatus())
                .build();
    }
}
