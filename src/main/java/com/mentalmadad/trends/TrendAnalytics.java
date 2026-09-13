package com.mentalmadad.trends;

import com.mentalmadad.entity.enums.AlertType;
import com.mentalmadad.trends.TrendNormalizer.IndexedPoint;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * The analysis layer: momentum, spike detection, forecasting and correlation.
 *
 * Design Notes:
 * - Pure static functions over an already-normalised series. No Spring, no IO,
 *   no clock — every number the UI shows can be reproduced in a unit test.
 * - Spike detection is a z-score against the trailing baseline (28 days by
 *   default) rather than a fixed percentage, so a noisy term does not alert
 *   every other day while a normally-flat term alerts as soon as it moves.
 */
public final class TrendAnalytics {

    /** Days of history used as the baseline for spike detection. */
    public static final int BASELINE_DAYS = 28;
    /** Window used for momentum (this week vs the week before). */
    public static final int MOMENTUM_WINDOW = 7;
    /** z-score at which a move is reported as a spike. */
    public static final double SPIKE_Z = 2.0;
    /** z-score at which a move is reported as a breakout. */
    public static final double BREAKOUT_Z = 3.5;

    private TrendAnalytics() {
    }

    public static double latest(List<IndexedPoint> points) {
        return points == null || points.isEmpty() ? 0d : points.get(points.size() - 1).value();
    }

    public static double average(List<IndexedPoint> points) {
        if (points == null || points.isEmpty()) {
            return 0d;
        }
        double sum = 0d;
        for (IndexedPoint point : points) {
            sum += point.value();
        }
        return TrendNormalizer.round1(sum / points.size());
    }

    public static IndexedPoint peak(List<IndexedPoint> points) {
        if (points == null || points.isEmpty()) {
            return null;
        }
        IndexedPoint best = points.get(0);
        for (IndexedPoint point : points) {
            if (point.value() > best.value()) {
                best = point;
            }
        }
        return best;
    }

    /**
     * Percent change of the last {@code MOMENTUM_WINDOW} days against the
     * window before it. Returns 0 when there is not enough history, and caps
     * the result at +/-999% so a near-zero baseline cannot produce an absurd
     * headline number.
     */
    public static double momentumPct(List<IndexedPoint> points) {
        if (points == null || points.size() < MOMENTUM_WINDOW * 2) {
            return 0d;
        }
        int size = points.size();
        double recent = meanOf(points, size - MOMENTUM_WINDOW, size);
        double previous = meanOf(points, size - MOMENTUM_WINDOW * 2, size - MOMENTUM_WINDOW);
        if (previous <= 0.0001d) {
            return recent > 0 ? 999d : 0d;
        }
        double pct = ((recent - previous) / previous) * 100d;
        return TrendNormalizer.round1(Math.max(-999d, Math.min(999d, pct)));
    }

    /**
     * How far the most recent day sits from its trailing baseline, in standard
     * deviations. A flat baseline (zero variance) reports 0 rather than
     * infinity, so a term that has never moved never alerts.
     */
    public static double spikeZScore(List<IndexedPoint> points) {
        if (points == null || points.size() < MOMENTUM_WINDOW + 1) {
            return 0d;
        }
        int size = points.size();
        int start = Math.max(0, size - 1 - BASELINE_DAYS);
        double mean = meanOf(points, start, size - 1);
        double variance = 0d;
        int count = 0;
        for (int i = start; i < size - 1; i++) {
            double diff = points.get(i).value() - mean;
            variance += diff * diff;
            count++;
        }
        if (count < 2) {
            return 0d;
        }
        double stdDev = Math.sqrt(variance / (count - 1));
        if (stdDev < 0.5d) {
            // Guard against a near-constant baseline: require a meaningful
            // absolute move before calling anything a spike.
            double delta = points.get(size - 1).value() - mean;
            return Math.abs(delta) >= 10d ? TrendNormalizer.round1(delta / 5d) : 0d;
        }
        return TrendNormalizer.round1((points.get(size - 1).value() - mean) / stdDev);
    }

    /** Classifies a z-score into an alert type, or null when the move is unremarkable. */
    public static AlertType classifyAlert(double zScore) {
        if (zScore >= BREAKOUT_Z) {
            return AlertType.BREAKOUT;
        }
        if (zScore >= SPIKE_Z) {
            return AlertType.SPIKE;
        }
        if (zScore <= -SPIKE_Z) {
            return AlertType.DROP;
        }
        return null;
    }

    /** Human-facing status word shown next to the headline number. */
    public static String status(double momentumPct, double zScore) {
        if (zScore >= BREAKOUT_Z || momentumPct >= 200d) {
            return "Breakout";
        }
        if (momentumPct >= 15d || zScore >= SPIKE_Z) {
            return "Rising";
        }
        if (momentumPct <= -30d || zScore <= -SPIKE_Z) {
            return "Falling";
        }
        if (momentumPct <= -10d) {
            return "Cooling";
        }
        return "Steady";
    }

    /**
     * Short forecast built from an ordinary-least-squares fit over the trailing
     * {@code BASELINE_DAYS} plus a day-of-week seasonality factor — the weekly
     * rhythm is the dominant pattern in daily interest data, and ignoring it
     * makes Monday predictions consistently wrong.
     */
    public static List<IndexedPoint> forecast(List<IndexedPoint> points, int horizonDays) {
        List<IndexedPoint> out = new ArrayList<>();
        if (points == null || points.size() < MOMENTUM_WINDOW * 2 || horizonDays <= 0) {
            return out;
        }
        int size = points.size();
        int start = Math.max(0, size - BASELINE_DAYS);
        int n = size - start;

        double sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (int i = start; i < size; i++) {
            double x = i - start;
            double y = points.get(i).value();
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
        }
        double denominator = (n * sumXX) - (sumX * sumX);
        double slope = denominator == 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denominator;
        double intercept = (sumY - slope * sumX) / n;

        double[] weekdayFactor = weekdayFactors(points);
        LocalDate lastDate = points.get(size - 1).date();
        for (int h = 1; h <= horizonDays; h++) {
            LocalDate date = lastDate.plusDays(h);
            double trend = intercept + slope * (n - 1 + h);
            double seasonal = weekdayFactor[date.getDayOfWeek().getValue() - 1];
            double value = TrendNormalizer.clamp(trend * seasonal);
            out.add(new IndexedPoint(date, TrendNormalizer.round1(value), 0d));
        }
        return out;
    }

    /**
     * Pearson correlation between two equally-dated series, in [-1, 1].
     * Returns 0 for mismatched or degenerate input — the UI reads 0 as
     * "no relationship", which is the honest answer when we cannot compute one.
     */
    public static double correlation(List<IndexedPoint> a, List<IndexedPoint> b) {
        if (a == null || b == null || a.size() != b.size() || a.size() < 3) {
            return 0d;
        }
        int n = a.size();
        double meanA = average(a);
        double meanB = average(b);
        double covariance = 0, varA = 0, varB = 0;
        for (int i = 0; i < n; i++) {
            double da = a.get(i).value() - meanA;
            double db = b.get(i).value() - meanB;
            covariance += da * db;
            varA += da * da;
            varB += db * db;
        }
        if (varA <= 0 || varB <= 0) {
            return 0d;
        }
        double r = covariance / Math.sqrt(varA * varB);
        return Math.round(Math.max(-1d, Math.min(1d, r)) * 100d) / 100d;
    }

    /** Mean over [fromInclusive, toExclusive); 0 for an empty or invalid range. */
    private static double meanOf(List<IndexedPoint> points, int fromInclusive, int toExclusive) {
        int from = Math.max(0, fromInclusive);
        int to = Math.min(points.size(), toExclusive);
        if (to <= from) {
            return 0d;
        }
        double sum = 0d;
        for (int i = from; i < to; i++) {
            sum += points.get(i).value();
        }
        return sum / (to - from);
    }

    /**
     * Multiplicative day-of-week factors (index 0 = Monday) derived from the
     * series itself. Days with no observations get a neutral 1.0.
     */
    private static double[] weekdayFactors(List<IndexedPoint> points) {
        double[] sums = new double[7];
        int[] counts = new int[7];
        double total = 0d;
        for (IndexedPoint point : points) {
            int idx = point.date().getDayOfWeek().getValue() - 1;
            sums[idx] += point.value();
            counts[idx]++;
            total += point.value();
        }
        double overallMean = points.isEmpty() ? 0d : total / points.size();
        double[] factors = new double[7];
        for (int i = 0; i < 7; i++) {
            if (counts[i] == 0 || overallMean <= 0.0001d) {
                factors[i] = 1d;
            } else {
                double dayMean = sums[i] / counts[i];
                // Damp the factor so one odd week cannot swing the forecast.
                factors[i] = Math.max(0.5d, Math.min(1.5d, dayMean / overallMean));
            }
        }
        return factors;
    }
}
