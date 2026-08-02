package com.mentalmadad.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mentalmadad.dto.request.ChatRequest;
import com.mentalmadad.dto.request.MoodRequest;
import com.mentalmadad.dto.response.ChatReply;
import com.mentalmadad.dto.response.MoodAnalysis;
import com.mentalmadad.dto.response.Recommendation;
import com.mentalmadad.service.AiService;
import com.mentalmadad.security.CustomUserDetailsService;
import com.mentalmadad.security.JwtProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for AiController using MockMvc.
 *
 * Security auto-configuration is excluded — these tests focus on the controller
 * layer only (endpoint shapes, request validation, JSON serialization). The
 * JWT filter chain is not exercised here (matches AuthControllerTest style).
 *
 * The three endpoints' request/response shapes are pinned here so the
 * frontend chat/mood shells can rely on them.
 */
@WebMvcTest(
    value = AiController.class,
    excludeAutoConfiguration = {
        SecurityAutoConfiguration.class,
        SecurityFilterAutoConfiguration.class,
        UserDetailsServiceAutoConfiguration.class
    }
)
@DisplayName("AiController Integration Tests")
class AiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AiService aiService;

    // The @WebMvcTest slice picks up the JwtAuthenticationFilter @Component;
    // these mocks satisfy its dependencies (same pattern as AuthControllerTest).
    @MockBean
    private JwtProvider jwtProvider;

    @MockBean
    private CustomUserDetailsService customUserDetailsService;

    @Test
    @DisplayName("POST /api/ai/chat returns the chat reply shape")
    void chat_ValidRequest_ReturnsChatReply() throws Exception {
        ChatReply reply = ChatReply.builder()
                .reply("Thank you for sharing that with me. I'm here to listen.")
                .crisisDetected(false)
                .moodInsight("You sound like you're going through a hard time right now.")
                .resources(List.of("4-7-8 breathing exercise"))
                .build();
        when(aiService.chat(any(ChatRequest.class))).thenReturn(reply);

        mockMvc.perform(post("/api/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("message", "I feel anxious", "conversationId", "c-1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply").value("Thank you for sharing that with me. I'm here to listen."))
                .andExpect(jsonPath("$.crisisDetected").value(false))
                .andExpect(jsonPath("$.moodInsight").value("You sound like you're going through a hard time right now."))
                .andExpect(jsonPath("$.resources[0]").value("4-7-8 breathing exercise"));
    }

    @Test
    @DisplayName("POST /api/ai/chat with blank message returns 400")
    void chat_BlankMessage_ReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/ai/mood/analyze returns the mood analysis shape")
    void analyzeMood_ValidText_ReturnsMoodAnalysis() throws Exception {
        MoodAnalysis analysis = MoodAnalysis.builder()
                .sentimentScore(-0.67)
                .moodLabel("Struggling")
                .summary("You sound like you're carrying a heavy load right now.")
                .suggestions(List.of("Try the 4-7-8 breathing exercise",
                        "Consider talking to a licensed professional"))
                .build();
        when(aiService.analyzeMood(any(MoodRequest.class))).thenReturn(analysis);

        mockMvc.perform(post("/api/ai/mood/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("text", "I feel sad and hopeless"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sentimentScore").value(-0.67))
                .andExpect(jsonPath("$.moodLabel").value("Struggling"))
                .andExpect(jsonPath("$.suggestions.length()").value(2));
    }

    @Test
    @DisplayName("POST /api/ai/mood/analyze with blank text returns 400")
    void analyzeMood_BlankText_ReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/ai/mood/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"  \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /api/ai/recommendations returns a recommendation list")
    void recommend_WithQueryAndLimit_ReturnsRecommendations() throws Exception {
        Recommendation rec = Recommendation.builder()
                .doctorId(1L)
                .name("Dr. Jane Smith")
                .specialization("Clinical Psychology")
                .rating(4.8)
                .reviewCount(42)
                .consultationFee(new BigDecimal("1500.00"))
                .reason("Dr. Jane Smith — specializes in Clinical Psychology, a strong match for 'anxiety' concerns.")
                .build();
        when(aiService.recommend(eq("anxiety"), eq(3))).thenReturn(List.of(rec));

        mockMvc.perform(get("/api/ai/recommendations")
                        .param("query", "anxiety")
                        .param("limit", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].doctorId").value(1))
                .andExpect(jsonPath("$[0].name").value("Dr. Jane Smith"))
                .andExpect(jsonPath("$[0].reason").isString());
    }

    @Test
    @DisplayName("GET /api/ai/recommendations works with defaults (no params)")
    void recommend_NoParams_DefaultsQueryAndLimit() throws Exception {
        when(aiService.recommend(eq(""), eq(3))).thenReturn(List.of());

        mockMvc.perform(get("/api/ai/recommendations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }
}
