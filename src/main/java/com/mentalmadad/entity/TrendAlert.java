package com.mentalmadad.entity;

import com.mentalmadad.entity.enums.AlertType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A movement detected on a watched term. Created by the nightly refresh job for
 * users whose plan includes alerts; read through /api/trends/alerts.
 */
@Entity
@Table(name = "trend_alerts",
        uniqueConstraints = @UniqueConstraint(name = "uk_alert_user_term_day",
                columnNames = {"user_id", "term_key", "geo", "detected_on"}),
        indexes = @Index(name = "idx_trend_alerts_user", columnList = "user_id,detected_on"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrendAlert {

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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AlertType type;

    /** Standard deviations away from the 28-day baseline. */
    @Column(name = "z_score", nullable = false)
    private double zScore;

    /** Percent change against the previous week's average. */
    @Column(name = "change_pct", nullable = false)
    private double changePct;

    @Column(name = "detected_on", nullable = false)
    private LocalDate detectedOn;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(name = "read_flag", nullable = false)
    @Builder.Default
    private boolean read = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
