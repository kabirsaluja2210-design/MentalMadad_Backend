package com.mentalmadad.trends;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/**
 * Canonicalisation of search terms and region codes.
 *
 * Design Notes:
 * - Every cache key, database row and quota decision keys off {@link #key},
 *   so "Anxiety  Relief", "anxiety relief" and "ANXIETY RELIEF" are one term
 *   and are billed, cached and charted as one term.
 * - Accents are folded so "café" and "cafe" collapse together, matching what a
 *   user expects from a search box.
 */
public final class TermKeys {

    /** Longest term we accept — keeps the 160-char database columns safe. */
    public static final int MAX_TERM_LENGTH = 120;

    private TermKeys() {
    }

    /** Canonical lookup key for a term. Never null; empty input yields "". */
    public static String key(String rawTerm) {
        if (rawTerm == null) {
            return "";
        }
        String folded = Normalizer.normalize(rawTerm.trim(), Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .replaceAll("\\s+", " ")
                .toLowerCase(Locale.ROOT);
        return folded.length() > MAX_TERM_LENGTH ? folded.substring(0, MAX_TERM_LENGTH) : folded;
    }

    /** Trimmed, length-capped version of what the user typed (used for display). */
    public static String display(String rawTerm) {
        if (rawTerm == null) {
            return "";
        }
        String trimmed = rawTerm.trim().replaceAll("\\s+", " ");
        return trimmed.length() > MAX_TERM_LENGTH ? trimmed.substring(0, MAX_TERM_LENGTH) : trimmed;
    }

    /** Canonical region code — upper-case, defaulting to the worldwide bucket. */
    public static String geo(String rawGeo) {
        if (rawGeo == null || rawGeo.isBlank()) {
            return TrendCatalog.WORLDWIDE;
        }
        String upper = rawGeo.trim().toUpperCase(Locale.ROOT);
        return upper.length() > 8 ? upper.substring(0, 8) : upper;
    }

    /**
     * Splits a comma-separated term list into distinct, non-empty terms while
     * preserving the order the user typed them (chart series colours depend on
     * that order staying stable between requests).
     */
    public static List<String> splitTerms(String commaSeparated) {
        List<String> out = new ArrayList<>();
        if (commaSeparated == null || commaSeparated.isBlank()) {
            return out;
        }
        LinkedHashSet<String> seenKeys = new LinkedHashSet<>();
        for (String piece : commaSeparated.split(",")) {
            String display = display(piece);
            if (display.isEmpty()) {
                continue;
            }
            if (seenKeys.add(key(display))) {
                out.add(display);
            }
        }
        return out;
    }
}
