package com.mentalmadad.ai;

import com.mentalmadad.dto.response.ChatReply;
import com.mentalmadad.dto.response.MoodAnalysis;
import com.mentalmadad.dto.response.Recommendation;
import com.mentalmadad.entity.Doctor;
import com.mentalmadad.repository.DoctorRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Self-contained, deterministic, rule/keyword-based AI provider.
 *
 * This is the zero-budget default engine: it works out of the box with no
 * external API key and no network calls. Everything is derived from curated
 * keyword lexicons and template replies, so behaviour is fully deterministic
 * and unit-testable.
 *
 * Design Notes:
 * - GoF Strategy: implements {@link AiProvider}; selected by the
 *   {@code app.ai.provider=local} property (default when unset, via
 *   {@link ConditionalOnProperty}). Swap in a real LLM later by implementing
 *   {@link AiProvider} with a different property value.
 * - SAFETY FIRST: the crisis path (self-harm/suicide keywords) is checked
 *   before any other intent and always returns real helplines. The assistant
 *   NEVER gives medical advice and every reply carries a supportive
 *   disclaimer saying it is not a medical professional.
 * - SOLID SRP: lexicons (chat intents, mood words, recommendation keyword
 *   mapping) are static constants; scoring/matching logic is small private
 *   methods so each behaviour stays readable and testable.
 */
@Service
@ConditionalOnProperty(name = "app.ai.provider", havingValue = "local", matchIfMissing = true)
public class LocalRuleBasedAiProvider implements AiProvider {

    private final DoctorRepository doctorRepository;

    public LocalRuleBasedAiProvider(DoctorRepository doctorRepository) {
        this.doctorRepository = doctorRepository;
    }

    // ============================================================
    // Safety & disclaimer
    // ============================================================

    /**
     * Crisis keywords (self-harm / suicide). Substring matching on purpose:
     * in a safety feature we prefer sensitivity over precision. Each phrase
     * is chosen to be unambiguous ("die" alone is NOT included).
     */
    private static final List<String> CRISIS_KEYWORDS = List.of(
            "kill myself", "suicide", "suicidal", "end my life", "end it all",
            "want to die", "wanna die", "no reason to live", "nothing to live for",
            "self harm", "self-harm", "hurt myself", "better off dead",
            "better off without me", "take my own life", "give up on life",
            "don't want to live", "dont want to live", "thinking of ending");

    /** Supportive disclaimer appended to EVERY reply (crisis included). */
    private static final String DISCLAIMER =
            "Remember: I'm an AI support assistant, not a medical professional. What I share is "
                    + "supportive and informational only — it is not medical advice or a diagnosis. "
                    + "For personal care, please speak with a licensed mental health professional, "
                    + "and in an emergency call 112 or go to your nearest emergency room.";

    /** Real helplines (India-focused, matching the platform's market). */
    private static final List<String> CRISIS_RESOURCES = List.of(
            "TeleMANAS (24x7): 14416",
            "iCall: +91-9152987821 (Mon-Sat, 10am-8pm)",
            "AASRA (24x7): +91-9820466726",
            "Emergency: call 112 or go to your nearest emergency room");

    private static final String CRISIS_REPLY =
            "I'm really concerned about what you just shared, and I want you to be safe. "
                    + "You matter, and these feelings can get better with the right support — please "
                    + "reach out to someone right now. You don't have to go through this alone:\n"
                    + "\u2022 TeleMANAS (India, 24x7): 14416\n"
                    + "\u2022 iCall: +91-9152987821 (Mon\u2013Sat, 10am\u20138pm)\n"
                    + "\u2022 AASRA (24x7): +91-9820466726\n"
                    + "If you are in immediate danger, call 112 or go to your nearest emergency room.";

    // ============================================================
    // Chat intents (checked in priority order)
    // ============================================================

    private static final List<String> STRESS_KEYWORDS = List.of(
            "stress", "stressed", "stressful", "anxiety", "anxious", "panic",
            "overwhelmed", "worried", "worry", "worries", "pressure", "burnout",
            "burned out", "tension", "frazzled");

    private static final List<String> SADNESS_KEYWORDS = List.of(
            "sad", "sadness", "depressed", "depression", "unhappy", "miserable",
            "lonely", "loneliness", "crying", "cry", "down", "low", "empty",
            "numb", "hopeless", "worthless", "grief", "grieving", "heartbroken", "blue");

    private static final List<String> SLEEP_KEYWORDS = List.of(
            "sleep", "sleeping", "insomnia", "can't sleep", "cant sleep", "tired",
            "exhausted", "nightmare", "nightmares", "restless", "sleepless");

    private static final List<String> RELATIONSHIP_KEYWORDS = List.of(
            "relationship", "relationships", "partner", "boyfriend", "girlfriend",
            "husband", "wife", "marriage", "married", "breakup", "break up",
            "divorce", "family", "friend", "friends");

    private static final List<String> GREETING_PHRASES = List.of(
            "good morning", "good afternoon", "good evening", "how are you");

    private static final Set<String> GREETING_WORDS = Set.of(
            "hello", "hi", "hey", "namaste", "hola");

    /** Greeting intent handled last (emotion intents win when both present). */
    private static final Intent GREETING_INTENT = new Intent(
            List.of(
                    "Hello! I'm here to listen — how are you feeling today?",
                    "Hi there! It's good to hear from you. What's on your mind?"),
            List.of());

    private static final Intent STRESS_INTENT = new Intent(
            List.of(
                    "I hear you — that sounds really stressful. Your feelings are valid, and it's "
                            + "okay to feel overwhelmed. Let's take it one step at a time: try five slow, "
                            + "deep breaths right now. Would you like to talk about what's weighing on "
                            + "you most?",
                    "Thank you for telling me — carrying stress alone makes it heavier. A useful trick "
                            + "is the 4-7-8 breath: inhale 4 seconds, hold 7, exhale 8. Want to explore "
                            + "what is driving the stress together?"),
            List.of(
                    "4-7-8 breathing exercise: inhale 4s, hold 7s, exhale 8s — repeat 4 times",
                    "Take a 5-minute walk and notice what you see, hear, and smell"));

    private static final Intent SADNESS_INTENT = new Intent(
            List.of(
                    "I'm sorry you're feeling this way. It takes courage to share that, and you are "
                            + "not alone — sadness is something many people carry at times. Be gentle "
                            + "with yourself today; even small moments of self-care count. Is there "
                            + "something that made today harder?",
                    "Thank you for being honest with me. Low days are real and heavy. Try naming one "
                            + "feeling you have right now and writing it down — putting it into words "
                            + "often makes it feel a little lighter. I'm here with you."),
            List.of(
                    "Journaling prompt: 'What is one small thing that could bring me comfort today?'",
                    "Reach out to someone you trust — a short call or message can help",
                    "Book a consultation with a licensed therapist for ongoing support"));

    private static final Intent SLEEP_INTENT = new Intent(
            List.of(
                    "Trouble sleeping can really drain you, and you're not alone in that. A few things "
                            + "that often help: keep a consistent sleep schedule, avoid screens for an "
                            + "hour before bed, and build a calming wind-down routine. Would you like a "
                            + "quick guided breathing exercise?",
                    "Poor sleep and a racing mind often go together. Try writing down tomorrow's tasks "
                            + "before bed so your mind can let go of them. If sleeplessness persists for "
                            + "weeks, it's worth talking to a professional about it."),
            List.of(
                    "Sleep hygiene: same bedtime every night, no screens 1 hour before bed",
                    "Try progressive muscle relaxation (tense then relax each muscle group) before sleep"));

    private static final Intent RELATIONSHIP_INTENT = new Intent(
            List.of(
                    "Relationships can bring up some of our strongest feelings, and it's completely "
                            + "okay to feel confused or hurt. What would help you most right now — a "
                            + "listening ear, or thinking the situation through together?",
                    "That sounds like a lot to sit with. In difficult relationship moments, remember to "
                            + "check in with yourself too: what do you need, and what are your boundaries? "
                            + "I can help you untangle it if you'd like."),
            List.of(
                    "Talk to a trusted friend or counselor about the situation",
                    "Book a consultation with a therapist for relationship support"));

    private static final Intent GENERAL_INTENT = new Intent(
            List.of(
                    "Thank you for sharing that with me. I'm here to listen without judgment. Could you "
                            + "tell me a little more about how you've been feeling lately?",
                    "I appreciate you reaching out. Whatever is on your mind, you can say it here. "
                            + "Would you like to talk it through, or would a simple listening ear help "
                            + "more right now?"),
            List.of(
                    "Book a consultation with a licensed professional if you'd like deeper support",
                    "Try a 5-minute guided breathing exercise to settle your mind"));

    // ============================================================
    // Mood lexicon (shared by analyzeMood and chat moodInsight)
    // ============================================================

    /** Distress words: each occurrence subtracts 2 from the raw score. */
    private static final Set<String> NEGATIVE_WORDS = Set.of(
            "sad", "sadness", "depressed", "depression", "anxious", "anxiety",
            "worried", "worry", "stressed", "stressful", "overwhelmed", "hopeless",
            "worthless", "lonely", "alone", "scared", "afraid", "panic", "crying",
            "cry", "tired", "exhausted", "angry", "anger", "frustrated", "numb",
            "empty", "down", "low", "miserable", "awful", "terrible", "hurt",
            "pain", "hate", "useless", "stuck", "trapped", "unhappy", "grief",
            "grieving", "heartbroken", "restless", "insomnia", "blue", "drained");

    /** Positive words: each occurrence adds 1 to the raw score. */
    private static final Set<String> POSITIVE_WORDS = Set.of(
            "happy", "great", "good", "wonderful", "amazing", "grateful",
            "thankful", "loved", "excited", "calm", "peaceful", "hopeful",
            "better", "relieved", "joy", "joyful", "smile", "smiling", "fine",
            "okay", "optimistic", "strong", "proud", "confident", "relaxed",
            "blessed", "positive", "energized", "energised", "content", "glad",
            "cheerful", "upbeat", "balanced", "supported", "safe");

    /** Score thresholds for the mood label. */
    private static final double THRIVING_THRESHOLD = 0.35;
    private static final double STRUGGLING_THRESHOLD = -0.35;
    /** Divisor used to normalize the raw score into [-1, 1]. */
    private static final double SCORE_NORMALIZER = 6.0;

    // ============================================================
    // Recommendation keyword -> specialization mapping
    // ============================================================

    /**
     * Query keyword -> doctor specializations that address it. Used to boost
     * doctors whose specialization matches the user's concern; a doctor whose
     * profile simply mentions the keyword still gets a smaller boost.
     */
    private static final Map<String, List<String>> KEYWORD_SPECIALIZATIONS = Map.ofEntries(
            Map.entry("anxiety", List.of("Clinical Psychology")),
            Map.entry("anxious", List.of("Clinical Psychology")),
            Map.entry("panic", List.of("Clinical Psychology")),
            Map.entry("worry", List.of("Clinical Psychology")),
            Map.entry("worried", List.of("Clinical Psychology")),
            Map.entry("stress", List.of("Clinical Psychology")),
            Map.entry("stressed", List.of("Clinical Psychology")),
            Map.entry("overwhelmed", List.of("Clinical Psychology")),
            Map.entry("burnout", List.of("Clinical Psychology")),
            Map.entry("depression", List.of("Clinical Psychology", "Psychiatry")),
            Map.entry("depressed", List.of("Clinical Psychology", "Psychiatry")),
            Map.entry("mood", List.of("Clinical Psychology", "Psychiatry")),
            Map.entry("sad", List.of("Clinical Psychology")),
            Map.entry("sleep", List.of("Psychiatry", "Clinical Psychology")),
            Map.entry("insomnia", List.of("Psychiatry", "Clinical Psychology")),
            Map.entry("trauma", List.of("Clinical Psychology")),
            Map.entry("ptsd", List.of("Clinical Psychology")),
            Map.entry("relationship", List.of("Clinical Psychology")),
            Map.entry("marriage", List.of("Clinical Psychology")),
            Map.entry("couples", List.of("Clinical Psychology")),
            Map.entry("breakup", List.of("Clinical Psychology")),
            Map.entry("divorce", List.of("Clinical Psychology")),
            Map.entry("psychiatry", List.of("Psychiatry")),
            Map.entry("psychiatrist", List.of("Psychiatry")),
            Map.entry("medication", List.of("Psychiatry")),
            Map.entry("meds", List.of("Psychiatry")),
            Map.entry("therapy", List.of("Clinical Psychology")),
            Map.entry("therapist", List.of("Clinical Psychology")),
            Map.entry("counseling", List.of("Clinical Psychology")),
            Map.entry("counselling", List.of("Clinical Psychology")),
            Map.entry("addiction", List.of("Clinical Psychology")),
            Map.entry("adhd", List.of("Clinical Psychology")),
            Map.entry("anger", List.of("Clinical Psychology")),
            Map.entry("grief", List.of("Clinical Psychology")),
            Map.entry("lonely", List.of("Clinical Psychology")),
            Map.entry("loneliness", List.of("Clinical Psychology")));

    private static final String TOP_RATED_REASON = "Top-rated provider — highly rated by other patients.";
    private static final String FALLBACK_REASON =
            "No strong keyword match for your query — here are our top-rated providers.";
    private static final int DEFAULT_LIMIT = 3;
    private static final int MAX_LIMIT = 20;

    // ============================================================
    // AiProvider implementation — chat
    // ============================================================

    @Override
    public ChatReply chat(String message, String conversationId) {
        String text = message == null ? "" : message.trim().toLowerCase(Locale.ROOT);

        // Safety first: crisis check runs before every other intent.
        if (isCrisis(text)) {
            return ChatReply.builder()
                    .crisisDetected(true)
                    .reply(CRISIS_REPLY + "\n\n" + DISCLAIMER)
                    .resources(CRISIS_RESOURCES)
                    .build();
        }

        Intent intent = detectIntent(text);
        String reply = pick(intent.replies, text) + "\n\n" + DISCLAIMER;
        return ChatReply.builder()
                .crisisDetected(false)
                .reply(reply)
                .moodInsight(moodInsightFor(text))
                .resources(intent.resources)
                .build();
    }

    /** Substring matching for crisis keywords — sensitivity preferred in a safety feature. */
    private boolean isCrisis(String text) {
        for (String keyword : CRISIS_KEYWORDS) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Detect the chat intent in priority order:
     * crisis (handled earlier) > stress > sadness > sleep > relationship > greeting > general.
     */
    private Intent detectIntent(String text) {
        if (hasAnyKeyword(text, STRESS_KEYWORDS)) {
            return STRESS_INTENT;
        }
        if (hasAnyKeyword(text, SADNESS_KEYWORDS)) {
            return SADNESS_INTENT;
        }
        if (hasAnyKeyword(text, SLEEP_KEYWORDS)) {
            return SLEEP_INTENT;
        }
        if (hasAnyKeyword(text, RELATIONSHIP_KEYWORDS)) {
            return RELATIONSHIP_INTENT;
        }
        if (isGreeting(text)) {
            return GREETING_INTENT;
        }
        return GENERAL_INTENT;
    }

    /** Multi-word keywords are matched as substrings; single words as whole tokens. */
    private boolean hasAnyKeyword(String text, List<String> keywords) {
        List<String> tokens = tokens(text);
        for (String keyword : keywords) {
            if (keyword.contains(" ")) {
                if (text.contains(keyword)) {
                    return true;
                }
            } else if (tokens.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private boolean isGreeting(String text) {
        for (String phrase : GREETING_PHRASES) {
            if (text.contains(phrase)) {
                return true;
            }
        }
        for (String token : tokens(text)) {
            if (GREETING_WORDS.contains(token)) {
                return true;
            }
        }
        return false;
    }

    /** Deterministic template pick: same message length -> same variant. */
    private String pick(List<String> variants, String text) {
        return variants.get(Math.floorMod(text.length(), variants.size()));
    }

    /**
     * One-line mood insight for the chat reply, derived from the same lexicon
     * used by {@link #analyzeMood}. Null when the message is neutral.
     */
    private String moodInsightFor(String text) {
        double score = score(text).normalized;
        if (score <= STRUGGLING_THRESHOLD) {
            return "You sound like you're going through a hard time right now.";
        }
        if (score >= THRIVING_THRESHOLD) {
            return "You sound like you're in a good place today.";
        }
        return null;
    }

    // ============================================================
    // AiProvider implementation — mood analysis
    // ============================================================

    @Override
    public MoodAnalysis analyzeMood(String text) {
        double score = score(text).normalized;
        String label = moodLabel(score);

        List<String> suggestions = new ArrayList<>();
        suggestions.add("Try the 4-7-8 breathing exercise: inhale for 4 seconds, hold for 7, "
                + "exhale for 8 — repeat 4 times.");
        switch (label) {
            case "Struggling" -> {
                suggestions.add("Consider talking to a licensed professional — you don't have to "
                        + "face this alone. You can book a consultation with one of our doctors.");
                suggestions.add("Journaling prompt: 'What has been weighing on me most, and what is "
                        + "one tiny step that could ease it?'");
            }
            case "Thriving" -> {
                suggestions.add("Reflect on what's lifting you up — write down three things you're "
                        + "grateful for today.");
                suggestions.add("Consider sharing your positive energy — supporting someone else is "
                        + "a great mood booster.");
            }
            default -> suggestions.add("Journaling prompt: 'How do I want to feel by the end of "
                    + "today, and what could help me get there?'");
        }

        return MoodAnalysis.builder()
                .sentimentScore(round2(score))
                .moodLabel(label)
                .summary(summaryFor(label))
                .suggestions(suggestions)
                .build();
    }

    private String moodLabel(double score) {
        if (score >= THRIVING_THRESHOLD) {
            return "Thriving";
        }
        if (score <= STRUGGLING_THRESHOLD) {
            return "Struggling";
        }
        return "Stable";
    }

    private String summaryFor(String label) {
        return switch (label) {
            case "Struggling" -> "You sound like you're carrying a heavy load right now — it's "
                    + "okay to ask for support.";
            case "Thriving" -> "You sound like you're in a positive headspace — your words carry "
                    + "energy and hope.";
            default -> "You sound like you're navigating things steadily — a normal mix of ups "
                    + "and downs.";
        };
    }

    /**
     * Lexicon-based mood scoring.
     * raw = (+1 per positive token) + (-2 per negative token); the result is
     * normalized into [-1, 1] by SCORE_NORMALIZER and clamped. Distress words
     * are weighted heavier because negative signals are more salient in a
     * mental-health context. Fully deterministic.
     */
    private MoodScore score(String text) {
        int raw = 0;
        for (String token : tokens(text)) {
            if (NEGATIVE_WORDS.contains(token)) {
                raw -= 2;
            } else if (POSITIVE_WORDS.contains(token)) {
                raw += 1;
            }
        }
        double normalized = Math.max(-1.0, Math.min(1.0, raw / SCORE_NORMALIZER));
        return new MoodScore(raw, normalized);
    }

    /** Split text into lowercase word tokens on non-letter boundaries. */
    private List<String> tokens(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        return Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^a-z]+"))
                .filter(token -> !token.isEmpty())
                .toList();
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    // ============================================================
    // AiProvider implementation — recommendations
    // ============================================================

    @Override
    public List<Recommendation> recommend(String query, int limit) {
        int safeLimit = Math.max(1, Math.min(limit <= 0 ? DEFAULT_LIMIT : limit, MAX_LIMIT));
        List<Doctor> doctors = doctorRepository.findAll();
        if (doctors.isEmpty()) {
            return List.of();
        }

        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);

        // Blank query: fall back to top-rated doctors.
        if (q.isBlank()) {
            return doctors.stream()
                    .sorted(topRatedComparator())
                    .limit(safeLimit)
                    .map(doctor -> toRecommendation(doctor, TOP_RATED_REASON))
                    .toList();
        }

        Set<String> tokens = new HashSet<>(tokens(q));
        List<DoctorMatch> matches = new ArrayList<>();
        for (Doctor doctor : doctors) {
            DoctorMatch match = matchDoctor(doctor, tokens);
            if (match.score() > 0) {
                matches.add(match);
            }
        }

        // No keyword matched anything: fall back to top-rated with an honest reason.
        if (matches.isEmpty()) {
            return doctors.stream()
                    .sorted(topRatedComparator())
                    .limit(safeLimit)
                    .map(doctor -> toRecommendation(doctor, FALLBACK_REASON))
                    .toList();
        }

        matches.sort(Comparator
                .comparingInt(DoctorMatch::score).reversed()
                .thenComparing(Comparator.comparingDouble(
                        (DoctorMatch m) -> m.doctor().getRating()).reversed()));

        return matches.stream()
                .limit(safeLimit)
                .map(match -> toRecommendation(match.doctor(), match.reason()))
                .toList();
    }

    /** Rating desc, then review count desc — "top-rated" ordering. */
    private Comparator<Doctor> topRatedComparator() {
        return Comparator
                .comparingDouble(Doctor::getRating)
                .reversed()
                .thenComparing(Comparator.comparingInt(Doctor::getReviewCount).reversed());
    }

    /**
     * Score one doctor against the query tokens.
     * A token whose mapped specializations match the doctor's specialization
     * earns +3 (strong signal); a token found anywhere in the doctor's
     * profile (specialization, about, name) earns +1.
     */
    private DoctorMatch matchDoctor(Doctor doctor, Set<String> tokens) {
        String specialization = nullSafe(doctor.getSpecialization());
        String about = nullSafe(doctor.getAbout());
        String name = displayName(doctor);
        String haystack = (specialization + " " + about + " " + name).toLowerCase(Locale.ROOT);
        String specLower = specialization.toLowerCase(Locale.ROOT);

        int score = 0;
        List<String> reasons = new ArrayList<>();
        for (String token : tokens) {
            if (token.length() < 3) {
                continue;
            }
            List<String> targets = KEYWORD_SPECIALIZATIONS.get(token);
            if (targets != null && targets.stream()
                    .anyMatch(target -> specLower.contains(target.toLowerCase(Locale.ROOT)))) {
                score += 3;
                reasons.add("specializes in " + specialization + ", a strong match for '"
                        + token + "' concerns");
            } else if (haystack.contains(token)) {
                score += 1;
                reasons.add("their profile covers '" + token + "'");
            }
        }

        if (score == 0) {
            return new DoctorMatch(doctor, 0, "");
        }
        String reason = "Dr. " + name + " — " + reasons.get(0) + ".";
        return new DoctorMatch(doctor, score, reason);
    }

    private Recommendation toRecommendation(Doctor doctor, String reason) {
        return Recommendation.builder()
                .doctorId(doctor.getId())
                .name("Dr. " + displayName(doctor))
                .specialization(doctor.getSpecialization())
                .rating(doctor.getRating())
                .reviewCount(doctor.getReviewCount())
                .consultationFee(doctor.getConsultationFee())
                .reason(reason)
                .build();
    }

    private String displayName(Doctor doctor) {
        if (doctor.getUser() == null) {
            return "";
        }
        return (nullSafe(doctor.getUser().getFirstName()) + " "
                + nullSafe(doctor.getUser().getLastName())).trim();
    }

    private String nullSafe(String value) {
        return value == null ? "" : value;
    }

    // ============================================================
    // Small internal value types
    // ============================================================

    /** A chat intent: reply templates + related resources. */
    private record Intent(List<String> replies, List<String> resources) {
    }

    /** Raw and normalized mood score for a text. */
    private record MoodScore(int raw, double normalized) {
    }

    /** A doctor plus its match score and reason. */
    private record DoctorMatch(Doctor doctor, int score, String reason) {
    }
}
