package com.mentalmadad.trends;

import java.time.LocalDate;
import java.util.List;

/**
 * Pluggable source of daily interest data.
 *
 * Design Notes:
 * - GoF Strategy: the product is deliberately not bound to one upstream. There
 *   is no official public Google Trends API, so TrendPulse reads daily signals
 *   from sources that do publish one (Wikipedia pageviews by default) and
 *   normalises them into the same 0-100 index. Adding a source — a search
 *   partner feed, an internal clickstream, a social API — means implementing
 *   this interface and registering the bean; nothing else changes.
 * - Providers return RAW values and never normalise: scaling is window- and
 *   comparison-relative and therefore belongs to the query, not the source.
 * - Implementations must be side-effect free and safe to call concurrently.
 */
public interface TrendDataProvider {

    /** Stable identifier persisted on every snapshot row (e.g. "wikipedia-pageviews"). */
    String name();

    /**
     * Whether this provider can serve traffic right now (configuration present,
     * network reachable). A provider that returns false is skipped by the
     * registry without being called.
     */
    boolean isAvailable();

    /**
     * Daily observations for {@code term} in {@code geo}, inclusive of both
     * bounds. Missing days may be omitted — the caller gap-fills.
     *
     * @return observations in ascending date order, or an empty list when the
     *         source has nothing for this term (never null, never throws for a
     *         simple "no data" outcome).
     */
    List<DailyPoint> fetchDaily(String term, String geo, LocalDate from, LocalDate to);

    /** Term completions for a search box; empty when the provider has no suggest API. */
    default List<String> suggest(String prefix, int limit) {
        return List.of();
    }
}
