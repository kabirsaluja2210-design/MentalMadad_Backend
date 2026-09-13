package com.mentalmadad.service;

import com.mentalmadad.dto.response.TrendComparisonResponse;
import com.mentalmadad.dto.response.TrendSeriesResponse;
import com.mentalmadad.dto.response.TrendingTopicResponse;
import com.mentalmadad.dto.response.UsageResponse;
import com.mentalmadad.trends.TrendNormalizer.IndexedPoint;

import java.util.List;

/**
 * The trend analysis API: daily series, comparisons, the trending board,
 * completions and export.
 *
 * Quota and entitlement checks happen here rather than in the controller, so
 * every caller — REST today, a scheduled job or a future public API tomorrow —
 * goes through the same rules.
 */
public interface TrendService {

    /** Daily series for one term, with insight and (on paid plans) a forecast. */
    TrendSeriesResponse series(Long userId, String term, String geo, int days);

    /** Several terms on one shared 0-100 scale, plus pairwise correlations. */
    TrendComparisonResponse compare(Long userId, String termsCsv, String geo, int days);

    /** Curated terms ranked by recent movement. Public — no account required. */
    List<TrendingTopicResponse> trendingNow(String geo, String category, int limit);

    /** Search-box completions. Public. */
    List<String> suggest(String prefix, int limit);

    /** CSV of one or more series (paid plans only). */
    String exportCsv(Long userId, String termsCsv, String geo, int days);

    /** Quota state for the caller plus live service counters. */
    UsageResponse usage(Long userId);

    /**
     * Normalised series without any quota accounting — for internal callers
     * (the refresh job and watchlist enrichment), never reachable from a
     * controller.
     */
    List<IndexedPoint> internalSeries(String term, String geo, int days);
}
