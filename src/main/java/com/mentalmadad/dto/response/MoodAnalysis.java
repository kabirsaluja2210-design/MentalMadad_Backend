package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Response DTO for POST /api/ai/mood/analyze.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Mood analysis of a piece of text")
public class MoodAnalysis {

    @Schema(description = "Sentiment score in the range [-1.0, 1.0]. Negative = distress, "
            + "positive = wellbeing.", example = "-0.67")
    private double sentimentScore;

    @Schema(description = "Mood label derived from the sentiment score.",
            example = "Struggling", allowableValues = {"Struggling", "Stable", "Thriving"})
    private String moodLabel;

    @Schema(description = "One-line summary of the analysis.", example = "You sound like you're "
            + "carrying a heavy load right now — it's okay to ask for support.")
    private String summary;

    @Schema(description = "2-3 concrete, actionable self-care suggestions (breathing exercise, "
            + "journaling prompt, professional support when distress is high).")
    private List<String> suggestions;
}
