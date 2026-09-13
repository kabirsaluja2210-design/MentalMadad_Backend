package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A watchlist entry. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A term the user is tracking")
public class TrackedTermResponse {

    private Long id;

    @Schema(example = "Burnout")
    private String term;

    @Schema(example = "IN")
    private String geo;

    @Schema(example = "India")
    private String geoLabel;

    @Schema(description = "Latest index value seen for this term", example = "57.3")
    private Double latest;

    @Schema(description = "7-day-over-7-day change in percent", example = "-12.4")
    private Double momentumPct;

    @Schema(description = "Status word derived from the latest refresh", example = "Cooling")
    private String status;

    @Schema(description = "When the refresh job last updated this row")
    private LocalDateTime lastCheckedAt;

    private LocalDateTime createdAt;
}
