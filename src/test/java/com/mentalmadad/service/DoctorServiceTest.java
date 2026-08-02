package com.mentalmadad.service;

import com.mentalmadad.dto.request.DoctorProfileUpdateRequest;
import com.mentalmadad.dto.response.DoctorDetailResponse;
import com.mentalmadad.entity.Doctor;
import com.mentalmadad.entity.User;
import com.mentalmadad.entity.enums.Role;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.exception.ResourceNotFoundException;
import com.mentalmadad.repository.DoctorRepository;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.service.impl.DoctorServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for DoctorServiceImpl self-profile endpoints (GET/PUT /api/doctors/me).
 *
 * Covers: me-returns-profile, 404-when-no-doctor-row, update-creates-when-missing
 * (create-or-update for newly registered providers), update-of-existing-profile,
 * negative-fee rejection, and create-without-specialization rejection.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DoctorService Unit Tests")
class DoctorServiceTest {

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private DoctorServiceImpl doctorService;

    private User doctorUser;
    private Doctor doctor;

    @BeforeEach
    void setUp() {
        doctorUser = User.builder()
                .id(3L).email("psychologist@test.com").firstName("Jane").lastName("Smith")
                .role(Role.PSYCHOLOGIST).emailVerified(true).build();

        doctor = Doctor.builder()
                .id(1L).user(doctorUser).specialization("Clinical Psychology")
                .licenseNumber("LIC-PSY-1001").yearsOfExperience(8)
                .consultationFee(new BigDecimal("1500.00"))
                .about("Licensed clinical psychologist")
                .build();
    }

    private DoctorProfileUpdateRequest updateRequest() {
        return DoctorProfileUpdateRequest.builder()
                .about("Updated bio")
                .consultationFee(new BigDecimal("2000.00"))
                .availableForChat(true)
                .availableForVideo(false)
                .availableInPerson(true)
                .yearsOfExperience(9)
                .specialization("Counselling Psychology")
                .build();
    }

    @Test
    @DisplayName("GET me — returns the authenticated doctor's full profile")
    void getMe_ExistingDoctor_ReturnsDetail() {
        when(doctorRepository.findByUserId(3L)).thenReturn(Optional.of(doctor));

        DoctorDetailResponse response = doctorService.getMe(3L);

        assertNotNull(response);
        assertEquals(1L, response.getId());
        assertEquals("Jane Smith", response.getName());
        assertEquals("Clinical Psychology", response.getSpecialization());
        assertEquals("LIC-PSY-1001", response.getLicenseNumber());
        assertEquals(8, response.getYearsOfExperience());
        assertEquals(new BigDecimal("1500.00"), response.getConsultationFee());
        assertEquals("Licensed clinical psychologist", response.getAbout());
        assertTrue(response.isAvailableForChat());
        verify(doctorRepository).findByUserId(3L);
    }

    @Test
    @DisplayName("GET me — 404 (ResourceNotFound) when the user has no Doctor row")
    void getMe_NoDoctorRow_ThrowsResourceNotFound() {
        when(doctorRepository.findByUserId(3L)).thenReturn(Optional.empty());

        ResourceNotFoundException ex = assertThrows(ResourceNotFoundException.class,
                () -> doctorService.getMe(3L));

        assertTrue(ex.getMessage().contains("Doctor profile"));
        assertTrue(ex.getMessage().contains("3"));
        verify(doctorRepository).findByUserId(3L);
    }

    @Test
    @DisplayName("PUT me — creates a Doctor row when the provider has none (create-or-update)")
    void updateMe_NoDoctorRow_CreatesProfile() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(doctorUser));
        when(doctorRepository.findByUserId(3L)).thenReturn(Optional.empty());
        when(doctorRepository.save(any(Doctor.class))).thenAnswer(inv -> {
            Doctor created = inv.getArgument(0);
            created.setId(50L);
            return created;
        });

        DoctorDetailResponse response = doctorService.updateMe(3L, updateRequest());

        assertNotNull(response);
        assertEquals(50L, response.getId());
        assertEquals("Counselling Psychology", response.getSpecialization());
        assertEquals(new BigDecimal("2000.00"), response.getConsultationFee());
        assertEquals("Updated bio", response.getAbout());
        assertEquals(9, response.getYearsOfExperience());
        assertFalse(response.isAvailableForVideo());
        assertTrue(response.isAvailableInPerson());
        verify(doctorRepository).save(any(Doctor.class));
    }

    @Test
    @DisplayName("PUT me — updates an existing Doctor row, keeping unset fields unchanged")
    void updateMe_ExistingDoctor_UpdatesFields() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(doctorUser));
        when(doctorRepository.findByUserId(3L)).thenReturn(Optional.of(doctor));
        when(doctorRepository.save(any(Doctor.class))).thenAnswer(inv -> inv.getArgument(0));

        DoctorProfileUpdateRequest request = DoctorProfileUpdateRequest.builder()
                .about("New about text")
                .consultationFee(new BigDecimal("1800.00"))
                .build();

        DoctorDetailResponse response = doctorService.updateMe(3L, request);

        assertEquals("New about text", response.getAbout());
        assertEquals(new BigDecimal("1800.00"), response.getConsultationFee());
        // untouched fields keep their previous values
        assertEquals("Clinical Psychology", response.getSpecialization());
        assertEquals(8, response.getYearsOfExperience());
        assertTrue(response.isAvailableForChat());
        assertTrue(response.isAvailableForVideo());
        verify(doctorRepository).save(any(Doctor.class));
    }

    @Test
    @DisplayName("PUT me — rejects a negative consultationFee")
    void updateMe_NegativeFee_ThrowsBadRequest() {
        DoctorProfileUpdateRequest request = DoctorProfileUpdateRequest.builder()
                .consultationFee(new BigDecimal("-50.00"))
                .build();

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> doctorService.updateMe(3L, request));

        assertTrue(ex.getMessage().contains("consultationFee"));
        verify(doctorRepository, never()).save(any(Doctor.class));
    }

    @Test
    @DisplayName("PUT me — creating a profile without specialization is rejected")
    void updateMe_CreateMissingSpecialization_ThrowsBadRequest() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(doctorUser));
        when(doctorRepository.findByUserId(3L)).thenReturn(Optional.empty());
        DoctorProfileUpdateRequest request = DoctorProfileUpdateRequest.builder()
                .about("No specialization given")
                .build();

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> doctorService.updateMe(3L, request));

        assertTrue(ex.getMessage().contains("specialization"));
        verify(doctorRepository, never()).save(any(Doctor.class));
    }
}
