package com.mentalmadad.ai;

import com.mentalmadad.dto.response.ChatReply;
import com.mentalmadad.dto.response.MoodAnalysis;
import com.mentalmadad.dto.response.Recommendation;

import java.util.List;

/**
 * Provider abstraction for the AI assistant module.
 *
 * Design Notes:
 * - GoF Strategy: the AI behaviour (chat, mood analysis, recommendations) is
 *   defined by this interface and selected at runtime by the
 *   {@code app.ai.provider} configuration flag. Controllers and services
 *   depend only on this interface, never on a concrete provider.
 * - SOLID OCP: a real LLM provider (e.g. OpenAI, Anthropic) can be plugged in
 *   later by implementing this interface and setting
 *   {@code app.ai.provider=<name>} — no controller or service changes needed.
 * - The default implementation is {@link LocalRuleBasedAiProvider}, a
 *   self-contained deterministic rule/keyword engine that works with zero
 *   external API keys and zero budget.
 */
public interface AiProvider {

    /**
     * Generate an empathetic chat reply for the given message.
     *
     * @param message        the user's message (never null after request validation)
     * @param conversationId optional conversation id for continuity (may be null;
     *                       the local engine is stateless but accepts it for parity)
     * @return chat reply with crisis flag, optional mood insight, and resources
     */
    ChatReply chat(String message, String conversationId);

    /**
     * Analyze the mood expressed in a piece of free text.
     *
     * @param text the text to analyze
     * @return sentiment score in [-1, 1], mood label, summary, and suggestions
     */
    MoodAnalysis analyzeMood(String text);

    /**
     * Recommend doctors matching the query keywords.
     *
     * @param query free-text query (blank/null tolerated — returns top-rated doctors)
     * @param limit maximum number of recommendations (provider clamps to a sane range)
     * @return ranked recommendations with short reasons
     */
    List<Recommendation> recommend(String query, int limit);
}
