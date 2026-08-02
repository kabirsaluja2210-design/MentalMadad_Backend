package com.mentalmadad.ai;

import com.mentalmadad.dto.response.ChatReply;
import com.mentalmadad.dto.response.MoodAnalysis;
import com.mentalmadad.dto.response.Recommendation;
import com.mentalmadad.entity.Doctor;
import com.mentalmadad.entity.User;
import com.mentalmadad.repository.DoctorRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * Unit tests for LocalRuleBasedAiProvider.
 *
 * Covers the four behaviours that matter for safety and usefulness:
 * 1. Mood scoring — negative text -> Struggling, positive text -> Thriving,
 *    neutral text -> Stable.
 * 2. Crisis detection — explicit self-harm/suicide text -> crisisDetected=true
 *    and the reply contains the real helplines (14416, iCall, AASRA, 112).
 * 3. Chat intent fallback — unknown text -> general empathetic reply with the
 *    supportive disclaimer; greeting/stress intents resolve correctly.
 * 4. Recommendation matching — blank query -> top-rated first; "anxiety" ->
 *    the Clinical Psychology doctor; "psychiatrist"/"medication" -> Psychiatry;
 *    unmatched query falls back to top-rated; limit is respected.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("LocalRuleBasedAiProvider Unit Tests")
class LocalRuleBasedAiProviderTest {

    @Mock
    private DoctorRepository doctorRepository;

    @InjectMocks
    private LocalRuleBasedAiProvider provider;

    private Doctor jane;   // Clinical Psychology, rating 4.8, 42 reviews
    private Doctor robert; // Psychiatry, rating 4.9, 87 reviews

    @BeforeEach
    void setUp() {
        User janeUser = User.builder().id(3L).firstName("Jane").lastName("Smith").build();
        jane = Doctor.builder().id(1L).user(janeUser)
                .specialization("Clinical Psychology")
                .about("Licensed clinical psychologist helping adults and adolescents with "
                        + "anxiety, depression, and stress management.")
                .rating(4.8).reviewCount(42)
                .consultationFee(new BigDecimal("1500.00"))
                .build();

        User robertUser = User.builder().id(4L).firstName("Robert").lastName("Johnson").build();
        robert = Doctor.builder().id(2L).user(robertUser)
                .specialization("Psychiatry")
                .about("Board-certified psychiatrist for adult psychiatry, mood disorders, "
                        + "and medication management.")
                .rating(4.9).reviewCount(87)
                .consultationFee(new BigDecimal("2500.00"))
                .build();
    }

    // ============================================================
    // Mood analysis
    // ============================================================

    @Test
    @DisplayName("Negative text scores below zero and is labelled Struggling")
    void analyzeMood_NegativeText_ReturnsStruggling() {
        MoodAnalysis analysis = provider.analyzeMood(
                "I feel so sad and anxious, everything is hopeless and I feel worthless");

        assertTrue(analysis.getSentimentScore() < 0, "distress text should score negative");
        assertEquals("Struggling", analysis.getMoodLabel());
        assertFalse(analysis.getSummary().isBlank());
        assertTrue(analysis.getSuggestions().size() >= 2,
                "should suggest concrete self-care steps");
        assertTrue(analysis.getSuggestions().stream()
                        .anyMatch(s -> s.toLowerCase().contains("professional")),
                "high distress should suggest talking to a professional");
    }

    @Test
    @DisplayName("Positive text scores above zero and is labelled Thriving")
    void analyzeMood_PositiveText_ReturnsThriving() {
        MoodAnalysis analysis = provider.analyzeMood(
                "I feel happy and grateful, today was wonderful and I feel calm");

        assertTrue(analysis.getSentimentScore() > 0, "positive text should score above zero");
        assertEquals("Thriving", analysis.getMoodLabel());
        assertFalse(analysis.getSummary().isBlank());
        assertTrue(analysis.getSuggestions().size() >= 2);
    }

    @Test
    @DisplayName("Neutral text scores zero and is labelled Stable")
    void analyzeMood_NeutralText_ReturnsStable() {
        MoodAnalysis analysis = provider.analyzeMood(
                "I went to the store and bought some groceries");

        assertEquals(0.0, analysis.getSentimentScore());
        assertEquals("Stable", analysis.getMoodLabel());
        assertFalse(analysis.getSummary().isBlank());
    }

    // ============================================================
    // Chat: crisis detection (the most important behaviour)
    // ============================================================

    @Test
    @DisplayName("Crisis text sets crisisDetected=true and includes real helplines")
    void chat_CrisisMessage_DetectsCrisisAndIncludesHelplines() {
        ChatReply reply = provider.chat(
                "I have been thinking about suicide and I want to end my life", "conv-1");

        assertTrue(reply.isCrisisDetected(), "crisis keywords must set crisisDetected");
        assertNotNull(reply.getReply());
        assertTrue(reply.getReply().contains("14416"), "TeleMANAS helpline missing");
        assertTrue(reply.getReply().contains("+91-9152987821"), "iCall helpline missing");
        assertTrue(reply.getReply().contains("+91-9820466726"), "AASRA helpline missing");
        assertTrue(reply.getReply().contains("112"), "emergency number missing");
        assertTrue(reply.getReply().contains("not a medical professional"),
                "disclaimer must be present even in crisis replies");
        assertNotNull(reply.getResources());
        assertFalse(reply.getResources().isEmpty(), "crisis reply must list resources");
        assertTrue(reply.getResources().stream().anyMatch(r -> r.contains("14416")));
    }

    @Test
    @DisplayName("Crisis check wins over any other intent")
    void chat_CrisisAndSadness_StillDetectsCrisis() {
        ChatReply reply = provider.chat("I feel so sad and I want to kill myself", null);

        assertTrue(reply.isCrisisDetected());
        assertTrue(reply.getReply().contains("14416"));
    }

    // ============================================================
    // Chat: intent detection and fallback
    // ============================================================

    @Test
    @DisplayName("Unknown text falls back to a general empathetic reply with disclaimer")
    void chat_GeneralMessage_FallsBackToGeneralIntentWithDisclaimer() {
        ChatReply reply = provider.chat("I bought a new phone today and the battery is amazing", null);

        assertFalse(reply.isCrisisDetected());
        assertNotNull(reply.getReply());
        assertTrue(reply.getReply().contains("listen"), "general reply should be empathetic");
        assertTrue(reply.getReply().contains("not a medical professional"),
                "supportive disclaimer must always be present");
        assertTrue(reply.getReply().contains("not medical advice"),
                "assistant must never give medical advice");
        assertNotNull(reply.getResources());
    }

    @Test
    @DisplayName("Greeting resolves to a greeting reply")
    void chat_Greeting_ReturnsGreetingReply() {
        ChatReply reply = provider.chat("Hello!", null);

        assertFalse(reply.isCrisisDetected());
        assertNotNull(reply.getReply());
        String lower = reply.getReply().toLowerCase();
        assertTrue(lower.contains("how are you feeling") || lower.contains("what's on your mind"));
        assertTrue(reply.getReply().contains("not a medical professional"));
    }

    @Test
    @DisplayName("Stress message resolves to stress intent with a mood insight")
    void chat_StressMessage_ReturnsStressIntentWithInsight() {
        ChatReply reply = provider.chat("Work has been so stressful and I feel anxious", "conv-2");

        assertFalse(reply.isCrisisDetected());
        assertTrue(reply.getReply().toLowerCase().contains("breath"),
                "stress reply should suggest a breathing exercise");
        assertTrue(reply.getReply().contains("not a medical professional"));
        assertNotNull(reply.getMoodInsight(), "distress message should carry a mood insight");
        assertFalse(reply.getResources().isEmpty(), "stress intent should list resources");
    }

    // ============================================================
    // Recommendations
    // ============================================================

    @Test
    @DisplayName("Blank query returns top-rated doctors first")
    void recommend_BlankQuery_ReturnsTopRatedFirst() {
        when(doctorRepository.findAll()).thenReturn(List.of(jane, robert));

        List<Recommendation> recs = provider.recommend("", 3);

        assertEquals(2, recs.size());
        assertEquals("Dr. Robert Johnson", recs.get(0).getName(), "higher rating (4.9) must rank first");
        assertTrue(recs.get(0).getReason().toLowerCase().contains("top-rated"));
    }

    @Test
    @DisplayName("'anxiety' query returns the Clinical Psychology doctor first with a reason")
    void recommend_AnxietyQuery_ReturnsRelevantDoctor() {
        when(doctorRepository.findAll()).thenReturn(List.of(robert, jane));

        List<Recommendation> recs = provider.recommend("I have anxiety", 3);

        assertFalse(recs.isEmpty());
        assertEquals("Dr. Jane Smith", recs.get(0).getName(),
                "Clinical Psychology must rank first for anxiety");
        assertTrue(recs.get(0).getReason().toLowerCase().contains("anxiety"),
                "reason should explain the match");
    }

    @Test
    @DisplayName("Psychiatry/medication query returns the psychiatrist first")
    void recommend_PsychiatryQuery_ReturnsPsychiatrist() {
        when(doctorRepository.findAll()).thenReturn(List.of(jane, robert));

        List<Recommendation> recs = provider.recommend("need a psychiatrist for medication", 3);

        assertFalse(recs.isEmpty());
        assertEquals("Dr. Robert Johnson", recs.get(0).getName());
    }

    @Test
    @DisplayName("Query with no keyword matches falls back to top-rated doctors")
    void recommend_NoKeywordMatch_FallsBackToTopRated() {
        when(doctorRepository.findAll()).thenReturn(List.of(jane, robert));

        List<Recommendation> recs = provider.recommend("quantum physics lectures", 3);

        assertFalse(recs.isEmpty());
        assertEquals("Dr. Robert Johnson", recs.get(0).getName());
        assertTrue(recs.get(0).getReason().toLowerCase().contains("top-rated"));
    }

    @Test
    @DisplayName("Limit is respected")
    void recommend_RespectsLimit() {
        when(doctorRepository.findAll()).thenReturn(List.of(jane, robert));

        List<Recommendation> recs = provider.recommend("", 1);

        assertEquals(1, recs.size());
        assertEquals("Dr. Robert Johnson", recs.get(0).getName());
    }
}
