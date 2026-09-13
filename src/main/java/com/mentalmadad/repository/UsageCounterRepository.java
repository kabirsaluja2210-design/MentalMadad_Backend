package com.mentalmadad.repository;

import com.mentalmadad.entity.UsageCounter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Optional;

public interface UsageCounterRepository extends JpaRepository<UsageCounter, Long> {

    Optional<UsageCounter> findByUserIdAndUsageDay(Long userId, LocalDate usageDay);

    /**
     * Atomic increment — avoids the read-modify-write race two concurrent
     * queries from the same account would otherwise hit on the daily quota.
     */
    @Modifying
    @Query("update UsageCounter u set u.queryCount = u.queryCount + :delta "
            + "where u.userId = :userId and u.usageDay = :day")
    int incrementCount(@Param("userId") Long userId,
                       @Param("day") LocalDate day,
                       @Param("delta") int delta);

    void deleteByUsageDayBefore(LocalDate cutoff);
}
