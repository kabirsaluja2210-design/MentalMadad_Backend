package com.mentalmadad.trends;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Deterministic offline data source.
 *
 * Design Notes:
 * - Always available, never touches the network. It is the last link in the
 *   provider chain so the product still demos, tests and renders charts in an
 *   air-gapped environment or when an upstream is down.
 * - Deterministic by construction: the value for a (term, geo, day) triple is
 *   derived from a hash of exactly those three things, so the same request
 *   always produces the same series — charts do not shimmer between reloads and
 *   assertions in tests are stable.
 * - The shape is intentionally realistic: a per-term base level, a slow trend,
 *   weekly seasonality (weekends dip), and rare multi-day bursts.
 */
@Component
public class SyntheticTrendProvider implements TrendDataProvider {

    public static final String NAME = "synthetic";

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isAvailable() {
        return true;
    }

    @Override
    public List<DailyPoint> fetchDaily(String term, String geo, LocalDate from, LocalDate to) {
        String key = TermKeys.key(term) + "|" + TermKeys.geo(geo);
        long seed = stableHash(key);

        // Per-term personality, all derived from the same seed.
        double base = 30d + (seed % 45);
        double trendPerDay = (((seed >> 8) % 21) - 10) / 100d;   // -0.10 .. +0.10 per day
        double weekendDip = 0.65d + (((seed >> 16) % 30) / 100d); // 0.65 .. 0.94
        double noiseAmplitude = 4d + ((seed >> 24) % 9);

        List<DailyPoint> points = new ArrayList<>();
        long dayIndex = 0;
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1), dayIndex++) {
            double value = base + (trendPerDay * dayIndex);

            int dow = day.getDayOfWeek().getValue();
            if (dow >= 6) {
                value *= weekendDip;
            }

            // Deterministic pseudo-noise for this exact day.
            long dayHash = stableHash(key + "#" + day.toEpochDay());
            double noise = ((dayHash % 2000) / 1000d - 1d) * noiseAmplitude;
            value += noise;

            // Rare burst: ~1 day in 60 starts a 3-day surge.
            long burstHash = stableHash(key + "!" + (day.toEpochDay() / 3));
            if (burstHash % 20 == 0) {
                value *= 1.8d + ((burstHash >> 8) % 120) / 100d;
            }

            points.add(new DailyPoint(day, Math.max(0d, Math.round(value * 10d) / 10d)));
        }
        return points;
    }

    @Override
    public List<String> suggest(String prefix, int limit) {
        String needle = TermKeys.key(prefix);
        if (needle.isEmpty()) {
            return TrendCatalog.allCuratedTerms().stream().limit(limit).toList();
        }
        return TrendCatalog.allCuratedTerms().stream()
                .filter(candidate -> TermKeys.key(candidate).contains(needle))
                .limit(limit)
                .toList();
    }

    /**
     * FNV-1a over the UTF-8 bytes, folded to a non-negative long. Java's
     * String.hashCode() is not specified to be stable across JVM versions for
     * every input, and this series must be reproducible across deployments.
     */
    private static long stableHash(String input) {
        long hash = 0xcbf29ce484222325L;
        for (byte b : input.getBytes(StandardCharsets.UTF_8)) {
            hash ^= (b & 0xff);
            hash *= 0x100000001b3L;
        }
        return Math.abs(hash == Long.MIN_VALUE ? 0 : hash);
    }
}
