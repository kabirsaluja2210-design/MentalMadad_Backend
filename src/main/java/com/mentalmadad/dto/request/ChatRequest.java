package com.mentalmadad.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request body for POST /api/ai/chat.
 *
 * Jackson deserialization: JSON body -> ChatRequest.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Chat message sent to the AI assistant")
public class ChatRequest {

    @NotBlank(message = "Message is required")
    @Schema(description = "The user's message to the assistant", example = "I've been feeling really anxious lately")
    private String message;

    @Schema(description = "Optional conversation id for continuity. Accepted by the local engine for "
            + "future provider parity (the rule-based engine is stateless).",
            example = "conv-123", nullable = true)
    private String conversationId;
}
