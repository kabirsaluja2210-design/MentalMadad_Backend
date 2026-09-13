package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/** Response for GET /api/trends/series — one term, one region, daily granularity. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Daily interest series for a single term")
public class TrendSeriesResponse {

    @Schema(description = "Term as the user typed it", example = "Mindfulness")
    private String term;

    @Schema(description = "Region code", example = "IN")
    private String geo;

    @Schema(description = "Region label", example = "India")
    private String geoLabel;

    @Schema(description = "First day of the window", example = "2026-06-15")
    private LocalDate from;

    @Schema(description = "Last day of the window", example = "2026-09-12")
    private LocalDate to;

    @Schema(description = "Dense daily series — every day in the window is present")
    private List<TrendPointResponse> points;

    @Schema(description = "7-day centred rolling average of the same series")
    private List<TrendPointResponse> smoothed;

    @Schema(description = "Projected values beyond the window (paid plans only; empty otherwise)")
    private List<TrendPointResponse> forecast;

    @Schema(description = "Computed headline metrics")
    private TrendInsightResponse insight;

    @Schema(description = "Provider that supplied the data", example = "wikipedia-pageviews")
    private String source;

    @Schema(description = "True when the response came from cache rather than a fresh computation")
    private boolean cached;

    @Schema(description = "Server-side time to produce this response, in milliseconds", example = "4")
    private long latencyMs;
}
