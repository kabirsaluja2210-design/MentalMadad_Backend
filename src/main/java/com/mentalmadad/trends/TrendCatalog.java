package com.mentalmadad.trends;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Static reference data for the product: supported regions and the curated
 * seed terms that populate the "Trending now" board and the empty-state
 * suggestions of the explore page.
 *
 * Design Notes:
 * - Regions map to a Wikipedia language project, which is how the default
 *   provider gives a genuine regional dimension (a term's interest in the
 *   Spanish-language corpus really is a different series from the English one).
 *   A provider that models geography differently is free to ignore the mapping.
 */
public final class TrendCatalog {

    public static final String WORLDWIDE = "GLOBAL";

    /** Region code -> display label, in menu order. */
    private static final Map<String, String> REGIONS = new LinkedHashMap<>();

    /** Region code -> Wikipedia language project used by the default provider. */
    private static final Map<String, String> REGION_PROJECTS = new LinkedHashMap<>();

    /** Category -> curated terms shown on the trending board. */
    private static final Map<String, List<String>> CATEGORIES = new LinkedHashMap<>();

    static {
        REGIONS.put(WORLDWIDE, "Worldwide");
        REGIONS.put("IN", "India");
        REGIONS.put("US", "United States");
        REGIONS.put("GB", "United Kingdom");
        REGIONS.put("DE", "Germany");
        REGIONS.put("FR", "France");
        REGIONS.put("ES", "Spain");
        REGIONS.put("BR", "Brazil");
        REGIONS.put("JP", "Japan");

        REGION_PROJECTS.put(WORLDWIDE, "en.wikipedia");
        REGION_PROJECTS.put("IN", "en.wikipedia");
        REGION_PROJECTS.put("US", "en.wikipedia");
        REGION_PROJECTS.put("GB", "en.wikipedia");
        REGION_PROJECTS.put("DE", "de.wikipedia");
        REGION_PROJECTS.put("FR", "fr.wikipedia");
        REGION_PROJECTS.put("ES", "es.wikipedia");
        REGION_PROJECTS.put("BR", "pt.wikipedia");
        REGION_PROJECTS.put("JP", "ja.wikipedia");

        CATEGORIES.put("Mental health", List.of(
                "Anxiety", "Burnout", "Mindfulness", "Sleep hygiene", "Therapy", "Depression"));
        CATEGORIES.put("Technology", List.of(
                "Artificial intelligence", "Quantum computing", "Electric vehicle",
                "Cybersecurity", "Cloud computing", "Robotics"));
        CATEGORIES.put("Business", List.of(
                "Inflation", "Startup", "Remote work", "Supply chain",
                "Cryptocurrency", "Initial public offering"));
        CATEGORIES.put("Health & fitness", List.of(
                "Protein", "Marathon", "Yoga", "Intermittent fasting", "Vitamin D", "Meditation"));
        CATEGORIES.put("Culture", List.of(
                "Cricket", "Football", "Cinema of India", "Music festival", "Podcast", "Streaming television"));
    }

    private TrendCatalog() {
    }

    public static Map<String, String> regions() {
        return REGIONS;
    }

    public static boolean isKnownRegion(String geo) {
        return REGIONS.containsKey(geo);
    }

    public static String regionLabel(String geo) {
        return REGIONS.getOrDefault(geo, geo);
    }

    /** Wikipedia project for a region, defaulting to the English corpus. */
    public static String wikipediaProject(String geo) {
        return REGION_PROJECTS.getOrDefault(geo, "en.wikipedia");
    }

    public static Map<String, List<String>> categories() {
        return CATEGORIES;
    }

    /** Every curated term, flattened — the warm set for the trending board. */
    public static List<String> allCuratedTerms() {
        return CATEGORIES.values().stream().flatMap(List::stream).distinct().toList();
    }

    public static List<String> termsForCategory(String category) {
        if (category == null || category.isBlank()) {
            return allCuratedTerms();
        }
        for (Map.Entry<String, List<String>> entry : CATEGORIES.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(category.trim())) {
                return entry.getValue();
            }
        }
        return allCuratedTerms();
    }
}
