package com.mentalmadad.service;

import com.mentalmadad.dto.request.ChatRequest;
import com.mentalmadad.dto.request.MoodRequest;
import com.mentalmadad.dto.response.ChatReply;
import com.mentalmadad.dto.response.MoodAnalysis;
import com.mentalmadad.dto.response.Recommendation;

import java.util.List;

/**
 * Application service for the AI assistant module.
 *
 * Design Notes:
 * - SOLID DIP: depends on request/response DTOs only — the concrete AI engine
 *   (local rule-based today, a real LLM later) is hidden behind the
 *   {@code AiProvider} strategy selected in {@link com.mentalmadad.ai.AiProvider}.
 */
public interface AiService {

    /**
     * Chat with the AI assistant.
     *
     * @param request the chat request (message + optional conversationId)
     * @return empathetic reply, crisis flag, optional mood insight, and resources
     */
    ChatReply chat(ChatRequest request);

    /**
     * Analyze the mood of a piece of text.
     *
     * @param request the text to analyze
     * @return sentiment score, mood label, summary, and suggestions
     */
    MoodAnalysis analyzeMood(MoodRequest request);

    /**
     * Recommend doctors for a free-text query (blank tolerated -> top-rated).
     *
     * @param query free-text query (may be blank/null)
     * @param limit requested limit (clamped to a sane range by the implementation)
     * @return ranked recommendations with short reasons
     */
    List<Recommendation> recommend(String query, int limit);
}
