package com.mentalmadad.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One stored daily observation for a term in a region.
 *
 * Design Notes:
 * - This table is the reason the product answers in milliseconds: the upstream
 *   data source is hit once per term per day by the refresh job, and every user
 *   query is then served out of Postgres/H2 (and the in-process cache in front
 *   of it) instead of going out to the network.
 * - {@code rawValue} is the source-native magnitude (e.g. pageviews). The 0-100
 *   index users see is computed per query window by TrendNormalizer, because
 *   Google-Trends-style scaling is relative to the requested window and to the
 *   other terms in a comparison — storing a pre-scaled number would be wrong
 *   the moment the window changes.
 */
@Entity
@Table(name = "trend_snapshots",
        uniqueConstraints = @UniqueConstraint(name = "uk_trend_snapshot_term_geo_day",
                columnNames = {"term_key", "geo", "observed_on"}),
        indexes = {
                @Index(name = "idx_trend_snapshot_lookup", columnList = "term_key,geo,observed_on")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrendSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Normalized lookup key (lower-cased, trimmed, whitespace-collapsed). */
    @Column(name = "term_key", nullable = false, length = 160)
    private String termKey;

    /** Human-readable term exactly as the user typed it the first time. */
    @Column(name = "display_term", nullable = false, length = 160)
    private String displayTerm;

    @Column(nullable = false, length = 16)
    private String geo;

    @Column(name = "observed_on", nullable = false)
    private LocalDate observedOn;

    @Column(name = "raw_value", nullable = false)
    private double rawValue;

    /** Provider that produced the value (e.g. "wikipedia-pageviews", "synthetic"). */
    @Column(nullable = false, length = 40)
    private String source;

    @Column(name = "fetched_at", nullable = false)
    private LocalDateTime fetchedAt;
}
