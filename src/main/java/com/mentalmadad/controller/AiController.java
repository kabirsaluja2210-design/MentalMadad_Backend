package com.mentalmadad.controller;

import com.mentalmadad.dto.request.ChatRequest;
import com.mentalmadad.dto.request.MoodRequest;
import com.mentalmadad.dto.response.ChatReply;
import com.mentalmadad.dto.response.MoodAnalysis;
import com.mentalmadad.dto.response.Recommendation;
import com.mentalmadad.service.AiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI assistant REST controller.
 *
 * Design Notes:
 * - SOLID DIP: depends on the AiService interface only.
 * - AUTH: all /api/ai/** endpoints require a valid JWT (see SecurityConfig —
 *   the matcher is explicit there; protected like other non-public routes).
 * - SAFETY: the underlying local engine never gives medical advice, always
 *   appends a supportive disclaimer, and responds to crisis keywords with a
 *   message containing real helplines (crisisDetected=true).
 */
@RestController
@RequestMapping("/api/ai")
@Tag(name = "AI Assistant", description = "AI-powered chat, mood analysis, and doctor recommendations "
        + "(backed by a self-contained local rule-based engine by default)")
public class AiController {

    private final AiService aiService;

    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/chat")
    @Operation(summary = "Chat with the AI assistant",
            description = "Send a message and receive an empathetic, template-based reply. "
                    + "Crisis keywords (self-harm/suicide) trigger a safety reply with real helplines "
                    + "and crisisDetected=true. The assistant never gives medical advice and always "
                    + "includes a supportive disclaimer.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<ChatReply> chat(@Valid @RequestBody ChatRequest request) {
        return ResponseEntity.ok(aiService.chat(request));
    }

    @PostMapping("/mood/analyze")
    @Operation(summary = "Analyze the mood of a piece of text",
            description = "Returns a sentiment score in [-1, 1], a mood label "
                    + "(Struggling / Stable / Thriving), a one-line summary, and 2-3 concrete "
                    + "self-care suggestions.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<MoodAnalysis> analyzeMood(@Valid @RequestBody MoodRequest request) {
        return ResponseEntity.ok(aiService.analyzeMood(request));
    }

    @GetMapping("/recommendations")
    @Operation(summary = "Get doctor recommendations",
            description = "Matches query keywords against doctor specializations and profiles and "
                    + "returns ranked recommendations with short reasons. A blank query returns "
                    + "top-rated doctors.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<List<Recommendation>> recommend(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "3") int limit) {
        return ResponseEntity.ok(aiService.recommend(query, limit));
    }
}
