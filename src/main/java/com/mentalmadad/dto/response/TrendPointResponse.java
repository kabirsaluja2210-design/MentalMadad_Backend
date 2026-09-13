package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/** One day of a trend series. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A single daily observation of a trend series")
public class TrendPointResponse {

    @Schema(description = "Calendar day (UTC) of the observation", example = "2026-09-12")
    private LocalDate date;

    @Schema(description = "Interest index, 0-100, relative to the peak of the requested window "
            + "(and, in a comparison, to the peak across all compared terms)", example = "72.4")
    private double value;

    @Schema(description = "Source-native magnitude behind the index (e.g. pageviews)", example = "18420")
    private double rawValue;
}
