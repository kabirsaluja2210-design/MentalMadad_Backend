package com.mentalmadad.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request body for POST /api/ai/mood/analyze.
 *
 * Jackson deserialization: JSON body -> MoodRequest.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Free text to analyze for mood")
public class MoodRequest {

    @NotBlank(message = "Text is required")
    @Schema(description = "Text (e.g. a journal entry) to analyze", example = "I feel sad and overwhelmed today")
    private String text;
}
