package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/** Headline numbers computed over one series. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Computed summary of a trend series")
public class TrendInsightResponse {

    @Schema(description = "Most recent day's index value", example = "64.2")
    private double latest;

    @Schema(description = "Mean index across the window", example = "48.7")
    private double average;

    @Schema(description = "Highest index in the window (always 100 for a single-term query)", example = "100")
    private double peak;

    @Schema(description = "Day the peak occurred", example = "2026-08-30")
    private LocalDate peakDate;

    @Schema(description = "Change of the last 7 days against the 7 before, in percent", example = "23.5")
    private double momentumPct;

    @Schema(description = "Distance of the latest day from its 28-day baseline, in standard deviations",
            example = "2.8")
    private double spikeZScore;

    @Schema(description = "Plain-language status", example = "Rising",
            allowableValues = {"Breakout", "Rising", "Steady", "Cooling", "Falling"})
    private String status;
}
