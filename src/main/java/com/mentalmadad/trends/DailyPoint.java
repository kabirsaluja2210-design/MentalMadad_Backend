package com.mentalmadad.trends;

import java.time.LocalDate;

/**
 * One raw observation from a data provider: the source-native magnitude for a
 * single day (pageviews, mentions, ...). Normalisation to the 0-100 index
 * happens later, per query window, in {@link TrendNormalizer}.
 */
public record DailyPoint(LocalDate date, double value) {

    public DailyPoint {
        if (date == null) {
            throw new IllegalArgumentException("date is required");
        }
        if (value < 0 || Double.isNaN(value) || Double.isInfinite(value)) {
            value = 0d;
        }
    }
}
