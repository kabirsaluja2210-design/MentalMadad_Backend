package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** A detected movement on a watched term. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Alert raised on a watched term")
public class TrendAlertResponse {

    private Long id;

    @Schema(example = "Anxiety")
    private String term;

    @Schema(example = "GLOBAL")
    private String geo;

    @Schema(example = "BREAKOUT", allowableValues = {"BREAKOUT", "SPIKE", "DROP"})
    private String type;

    @Schema(description = "Standard deviations from the 28-day baseline", example = "4.1")
    private double zScore;

    @Schema(description = "Percent change against the previous week", example = "132.0")
    private double changePct;

    private LocalDate detectedOn;

    @Schema(example = "Anxiety broke out in Worldwide — 4.1σ above its 28-day baseline (+132%).")
    private String message;

    private boolean read;

    private LocalDateTime createdAt;
}
