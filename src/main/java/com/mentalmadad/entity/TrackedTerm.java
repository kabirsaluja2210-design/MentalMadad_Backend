package com.mentalmadad.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A term a user watches. Tracked terms are what the nightly refresh job warms
 * and what alerting runs against, so the watchlist doubles as the product's
 * cache-warming hint list.
 */
@Entity
@Table(name = "tracked_terms",
        uniqueConstraints = @UniqueConstraint(name = "uk_tracked_user_term_geo",
                columnNames = {"user_id", "term_key", "geo"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrackedTerm {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "term_key", nullable = false, length = 160)
    private String termKey;

    @Column(name = "display_term", nullable = false, length = 160)
    private String displayTerm;

    @Column(nullable = false, length = 16)
    private String geo;

    /** Latest 0-100 index seen by the refresh job — powers the watchlist table. */
    @Column(name = "last_index_value")
    private Double lastIndexValue;

    /** 7-day-over-7-day momentum in percent, computed by the refresh job. */
    @Column(name = "last_momentum_pct")
    private Double lastMomentumPct;

    @Column(name = "last_checked_at")
    private LocalDateTime lastCheckedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
