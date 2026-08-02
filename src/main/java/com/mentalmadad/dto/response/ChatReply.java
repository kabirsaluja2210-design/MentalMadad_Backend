package com.mentalmadad.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Response DTO for POST /api/ai/chat.
 *
 * Jackson serialization:
 * - @JsonInclude(NON_NULL) — moodInsight is omitted when the message is
 *   emotionally neutral.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "Reply from the AI assistant")
public class ChatReply {

    @Schema(description = "The assistant's empathetic reply. Always ends with a supportive disclaimer "
            + "stating the AI is not a medical professional.")
    private String reply;

    @Schema(description = "True when the message contained crisis keywords (self-harm/suicide). "
            + "When true, reply contains a crisis message with real helplines.")
    private boolean crisisDetected;

    @Schema(description = "Optional one-line insight into the user's mood, derived from the message "
            + "text. Null when the message is emotionally neutral.",
            nullable = true, example = "You sound like you're going through a hard time right now.")
    private String moodInsight;

    @Schema(description = "Relevant support resources or helplines for the message. "
            + "Contains crisis helplines when crisisDetected is true.")
    private List<String> resources;
}
