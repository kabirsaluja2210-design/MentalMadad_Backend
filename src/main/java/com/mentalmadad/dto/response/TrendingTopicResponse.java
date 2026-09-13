package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** A row on the "Trending now" board. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A term ranked by recent movement")
public class TrendingTopicResponse {

    @Schema(description = "Term", example = "Quantum computing")
    private String term;

    @Schema(description = "Curated category the term belongs to", example = "Technology")
    private String category;

    @Schema(description = "Latest index value", example = "88.1")
    private double latest;

    @Schema(description = "7-day-over-7-day change in percent", example = "41.2")
    private double momentumPct;

    @Schema(description = "Status word", example = "Breakout")
    private String status;

    @Schema(description = "Last 14 index values, for the row's sparkline")
    private List<Double> sparkline;
}
