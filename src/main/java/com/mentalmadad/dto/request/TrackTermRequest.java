package com.mentalmadad.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Request body for POST /api/trends/watchlist. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Term to add to the watchlist")
public class TrackTermRequest {

    @NotBlank(message = "Term is required")
    @Size(max = 120, message = "Term must be 120 characters or fewer")
    @Schema(description = "Search term to track", example = "Burnout")
    private String term;

    @Schema(description = "Region code; defaults to GLOBAL", example = "IN")
    private String geo;
}
