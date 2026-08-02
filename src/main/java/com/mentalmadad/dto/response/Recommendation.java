package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Response DTO item for GET /api/ai/recommendations.
 * A recommended doctor with a short human-readable reason.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A recommended doctor with a short reason")
public class Recommendation {

    @Schema(description = "Doctor profile id", example = "1")
    private Long doctorId;

    @Schema(description = "Doctor display name", example = "Dr. Jane Smith")
    private String name;

    @Schema(description = "Specialization", example = "Clinical Psychology")
    private String specialization;

    @Schema(description = "Aggregate rating (0-5)", example = "4.8")
    private double rating;

    @Schema(description = "Number of reviews", example = "42")
    private int reviewCount;

    @Schema(description = "Consultation fee", example = "1500.00")
    private BigDecimal consultationFee;

    @Schema(description = "Short reason why this doctor was recommended",
            example = "Dr. Jane Smith specializes in Clinical Psychology, a strong match for "
                    + "'anxiety' concerns.")
    private String reason;
}
