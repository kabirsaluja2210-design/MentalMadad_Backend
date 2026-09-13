package com.mentalmadad.entity.enums;

/**
 * Kind of movement that produced a watchlist alert.
 * Thresholds live in TrendAnalytics so the classification stays testable.
 */
public enum AlertType {
    /** Interest broke out far above its recent baseline (z-score >= breakout threshold). */
    BREAKOUT,
    /** Interest rose sharply but below breakout level. */
    SPIKE,
    /** Interest dropped sharply below its recent baseline. */
    DROP
}
