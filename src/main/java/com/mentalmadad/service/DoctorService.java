package com.mentalmadad.service;
import com.mentalmadad.dto.request.DoctorProfileUpdateRequest; import com.mentalmadad.dto.response.*; import org.springframework.data.domain.*;
/**
 * Doctor directory + provider self-service.
 *
 * SOLID DIP: Controllers depend on this interface, never on the concrete
 * implementation. ISP: only doctor operations are exposed here.
 */
public interface DoctorService {
    Page<DoctorResponse> list(String specialization, String name, int page, int size);
    DoctorDetailResponse get(Long id);
    /** The authenticated PSYCHOLOGIST/PSYCHIATRIST's own full profile (404 if they have no Doctor row). */
    DoctorDetailResponse getMe(Long userId);
    /** Create-or-update the authenticated provider's own profile. */
    DoctorDetailResponse updateMe(Long userId, DoctorProfileUpdateRequest request);
}
