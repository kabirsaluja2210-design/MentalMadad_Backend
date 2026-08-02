package com.mentalmadad.dto.request;
import jakarta.validation.constraints.DecimalMin; import lombok.*; import java.math.BigDecimal;
/**
 * Payload for a doctor updating (or creating, via create-or-update semantics)
 * their own profile through GET/PUT /api/doctors/me.
 *
 * Design Notes:
 * - Partial-update friendly: every field is nullable; a null field means
 *   "keep the current value" when updating an existing Doctor row. When the
 *   row is being created, null fields fall back to sensible defaults
 *   (fee 0, experience 0, chat/video on, in-person off).
 * - SOLID SRP: this DTO only carries the fields a provider may self-edit;
 *   immutable identity fields (licenseNumber, rating, reviewCount) are
 *   deliberately absent — rating/reviewCount are computed by the platform,
 *   and licenseNumber is assigned at verification time (see DoctorServiceImpl).
 * - Bean validation (@DecimalMin) is defense-in-depth; the service re-validates
 *   so the rule holds even when the request bypasses the controller layer.
 */
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class DoctorProfileUpdateRequest {
    private String about;
    @DecimalMin(value = "0.0", message = "consultationFee must be greater than or equal to 0")
    private BigDecimal consultationFee;
    private Boolean availableForChat;
    private Boolean availableForVideo;
    private Boolean availableInPerson;
    private Integer yearsOfExperience;
    private String specialization;
}
