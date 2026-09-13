package com.mentalmadad.repository;

import com.mentalmadad.entity.TrackedTerm;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TrackedTermRepository extends JpaRepository<TrackedTerm, Long> {

    List<TrackedTerm> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<TrackedTerm> findByUserIdAndTermKeyAndGeo(Long userId, String termKey, String geo);

    Optional<TrackedTerm> findByIdAndUserId(Long id, Long userId);

    long countByUserId(Long userId);
}
