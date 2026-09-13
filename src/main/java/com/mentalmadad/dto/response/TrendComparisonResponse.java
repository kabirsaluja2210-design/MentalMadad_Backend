package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Response for GET /api/trends/compare — several terms on one shared 0-100 scale. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Multi-term comparison on a shared index scale")
public class TrendComparisonResponse {

    @Schema(description = "Region code", example = "GLOBAL")
    private String geo;

    @Schema(description = "Region label", example = "Worldwide")
    private String geoLabel;

    private LocalDate from;

    private LocalDate to;

    @Schema(description = "One entry per term, all scaled against the same maximum so the "
            + "lines are directly comparable")
    private List<TrendSeriesResponse> series;

    @Schema(description = "Pearson correlation for each unordered term pair, keyed \"A|B\"",
            example = "{\"Anxiety|Burnout\": 0.62}")
    private Map<String, Double> correlations;

    @Schema(description = "Term holding the peak of the window", example = "Anxiety")
    private String leader;

    @Schema(description = "Server-side time to produce this response, in milliseconds", example = "6")
    private long latencyMs;
}
