package com.mentalmadad.repository;

import com.mentalmadad.entity.Doctor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

/**
 * Spring Data JPA repository for Doctor entity.
 *
 * Design Notes:
 * - GoF Proxy: Spring Data JPA generates a runtime proxy implementing these
 *   query methods from their names (findByUserId, findBySpecialization...)
 *   or from explicit @Query definitions.
 * - SOLID ISP: exposes only Doctor-specific queries.
 */
public interface DoctorRepository extends JpaRepository<Doctor, Long> {

    Page<Doctor> findBySpecializationContainingIgnoreCase(String specialization, Pageable pageable);

    /**
     * Find the doctor profile owned by a user account (OneToOne on user_id).
     * Used to resolve the authenticated PSYCHOLOGIST/PSYCHIATRIST to their
     * doctor profile when listing their own calendar.
     */
    Optional<Doctor> findByUserId(Long userId);

    /**
     * Combined free-text search over specialization and provider name.
     * Both parameters are optional — null means "no filter".
     */
    @Query("select d from Doctor d where "
            + "(:specialization is null or lower(d.specialization) like lower(concat('%',:specialization,'%'))) "
            + "and (:name is null or lower(concat(d.user.firstName,' ',d.user.lastName)) like lower(concat('%',:name,'%'))) ")
    Page<Doctor> search(String specialization, String name, Pageable pageable);
}
