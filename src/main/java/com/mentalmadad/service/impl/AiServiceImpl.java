package com.mentalmadad.service.impl;

import com.mentalmadad.ai.AiProvider;
import com.mentalmadad.dto.request.ChatRequest;
import com.mentalmadad.dto.request.MoodRequest;
import com.mentalmadad.dto.response.ChatReply;
import com.mentalmadad.dto.response.MoodAnalysis;
import com.mentalmadad.dto.response.Recommendation;
import com.mentalmadad.service.AiService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Default AI service implementation.
 *
 * Design Notes:
 * - GoF Facade: exposes a clean, DTO-shaped API to the controller while
 *   delegating the actual intelligence to the configured {@link AiProvider}
 *   strategy. Adding a real LLM later only changes the provider bean, never
 *   this facade or the controller.
 * - Guards the recommendation limit so callers cannot request unbounded
 *   result sets (clamped to a sane range).
 */
@Service
public class AiServiceImpl implements AiService {

    private static final int DEFAULT_LIMIT = 3;
    private static final int MAX_LIMIT = 20;

    private final AiProvider aiProvider;

    public AiServiceImpl(AiProvider aiProvider) {
        this.aiProvider = aiProvider;
    }

    @Override
    public ChatReply chat(ChatRequest request) {
        return aiProvider.chat(request.getMessage(), request.getConversationId());
    }

    @Override
    public MoodAnalysis analyzeMood(MoodRequest request) {
        return aiProvider.analyzeMood(request.getText());
    }

    @Override
    public List<Recommendation> recommend(String query, int limit) {
        int safeLimit = (limit <= 0) ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        return aiProvider.recommend(query, safeLimit);
    }
}
