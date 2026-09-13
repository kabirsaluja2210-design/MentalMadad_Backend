package com.mentalmadad.repository;

import com.mentalmadad.entity.TrendAlert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TrendAlertRepository extends JpaRepository<TrendAlert, Long> {

    List<TrendAlert> findTop50ByUserIdOrderByDetectedOnDescIdDesc(Long userId);

    Optional<TrendAlert> findByIdAndUserId(Long id, Long userId);

    boolean existsByUserIdAndTermKeyAndGeoAndDetectedOn(
            Long userId, String termKey, String geo, LocalDate detectedOn);

    long countByUserIdAndReadFalse(Long userId);
}
