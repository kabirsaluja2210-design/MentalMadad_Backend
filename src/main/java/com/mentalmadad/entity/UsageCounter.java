package com.mentalmadad.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * Per-user, per-day query counter backing the plan quota.
 *
 * Design Notes:
 * - One row per (user, day) — enforced by a unique constraint so a race
 *   between two concurrent queries can never double-create the day's row.
 * - Counting lives in its own table rather than on Subscription so quota
 *   writes never contend with billing writes.
 */
@Entity
@Table(name = "usage_counters",
        uniqueConstraints = @UniqueConstraint(name = "uk_usage_user_day",
                columnNames = {"user_id", "usage_day"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UsageCounter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "usage_day", nullable = false)
    private LocalDate usageDay;

    @Column(name = "query_count", nullable = false)
    @Builder.Default
    private int queryCount = 0;
}
