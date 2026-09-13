package com.mentalmadad.trends;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Turns raw provider observations into the 0-100 interest index users see.
 *
 * Design Notes:
 * - Google-Trends semantics, reproduced deliberately:
 *     * the index is RELATIVE — 100 is the peak of the requested window, not an
 *       absolute volume;
 *     * in a comparison, all terms are scaled against ONE shared maximum, so the
 *       lines stay comparable to each other;
 *     * days the source has no data for are zeros, not gaps, so the series is
 *       always dense and the chart never lies by skipping a day.
 * - Pure functions only (no Spring, no IO) — this is the piece most worth
 *   unit-testing, and tests need it cheap to call.
 */
public final class TrendNormalizer {

    private TrendNormalizer() {
    }

    /** Dense, ascending series over [from, to] with missing days filled as 0. */
    public static List<DailyPoint> densify(List<DailyPoint> sparse, LocalDate from, LocalDate to) {
        Map<LocalDate, Double> byDate = new HashMap<>();
        if (sparse != null) {
            for (DailyPoint point : sparse) {
                if (point == null || point.date() == null) {
                    continue;
                }
                if (!point.date().isBefore(from) && !point.date().isAfter(to)) {
                    // Last write wins: providers occasionally repeat a day.
                    byDate.put(point.date(), point.value());
                }
            }
        }
        List<DailyPoint> dense = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            dense.add(new DailyPoint(day, byDate.getOrDefault(day, 0d)));
        }
        return dense;
    }

    /** Largest raw value across every series, or 0 when all series are empty. */
    public static double sharedMaximum(List<List<DailyPoint>> series) {
        double max = 0d;
        if (series == null) {
            return 0d;
        }
        for (List<DailyPoint> one : series) {
            if (one == null) {
                continue;
            }
            for (DailyPoint point : one) {
                max = Math.max(max, point.value());
            }
        }
        return max;
    }

    /**
     * Scales raw values to 0-100 against {@code maximum}.
     * A zero/negative maximum yields an all-zero index rather than NaN.
     */
    public static List<IndexedPoint> toIndex(List<DailyPoint> raw, double maximum) {
        List<IndexedPoint> indexed = new ArrayList<>(raw.size());
        for (DailyPoint point : raw) {
            double value = maximum > 0 ? (point.value() / maximum) * 100d : 0d;
            indexed.add(new IndexedPoint(point.date(), round1(clamp(value)), point.value()));
        }
        return indexed;
    }

    /**
     * Centred rolling mean used for the smoothed overlay on the chart. A window
     * of 1 (or a series shorter than the window) returns the input unchanged.
     */
    public static List<IndexedPoint> smooth(List<IndexedPoint> points, int window) {
        if (points == null || points.size() < 2 || window <= 1) {
            return points == null ? List.of() : points;
        }
        int half = window / 2;
        List<IndexedPoint> out = new ArrayList<>(points.size());
        for (int i = 0; i < points.size(); i++) {
            int start = Math.max(0, i - half);
            int end = Math.min(points.size() - 1, i + half);
            double sum = 0d;
            for (int j = start; j <= end; j++) {
                sum += points.get(j).value();
            }
            double mean = sum / (end - start + 1);
            out.add(new IndexedPoint(points.get(i).date(), round1(mean), points.get(i).rawValue()));
        }
        return out;
    }

    public static double clamp(double value) {
        if (Double.isNaN(value)) {
            return 0d;
        }
        return Math.max(0d, Math.min(100d, value));
    }

    public static double round1(double value) {
        return Math.round(value * 10d) / 10d;
    }

    /** A normalised point: the 0-100 index plus the raw magnitude behind it. */
    public record IndexedPoint(LocalDate date, double value, double rawValue) {
    }
}
