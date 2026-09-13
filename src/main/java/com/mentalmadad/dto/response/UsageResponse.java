package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Quota state for the calling account, plus live cache statistics. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Today's quota usage and service performance counters")
public class UsageResponse {

    @Schema(example = "PRO")
    private String plan;

    @Schema(description = "Queries used today", example = "37")
    private int used;

    @Schema(description = "Queries allowed per day on this plan", example = "1000")
    private int limit;

    @Schema(description = "Queries left today", example = "963")
    private int remaining;

    @Schema(description = "Watchlist entries in use", example = "12")
    private long watchlistUsed;

    @Schema(description = "Watchlist capacity on this plan", example = "50")
    private int watchlistLimit;

    @Schema(description = "Unread alerts", example = "3")
    private long unreadAlerts;

    @Schema(description = "Live cache hit rate in percent", example = "94.6")
    private double cacheHitRatePct;

    @Schema(description = "Series currently held in the in-process cache", example = "418")
    private int cachedSeries;

    @Schema(description = "Distinct terms with stored daily history", example = "1204")
    private long storedTerms;
}
