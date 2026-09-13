package com.mentalmadad.trends;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Ordered chain of data providers with automatic fallback.
 *
 * Design Notes:
 * - GoF Chain of Responsibility: each provider is asked in the configured
 *   order; the first one that is available AND returns a non-empty series
 *   answers the request. A dead upstream degrades the product to the next
 *   source instead of erroring the user's chart out.
 * - The configured order (app.trends.providers) is authoritative; any provider
 *   bean not named there is appended at the end so a newly added bean still
 *   participates without a config change.
 */
@Component
public class TrendProviderRegistry {

    private static final Logger log = LoggerFactory.getLogger(TrendProviderRegistry.class);

    private final List<TrendDataProvider> chain;

    public TrendProviderRegistry(List<TrendDataProvider> providers, TrendsProperties properties) {
        Map<String, TrendDataProvider> byName = new LinkedHashMap<>();
        for (TrendDataProvider provider : providers) {
            byName.put(provider.name(), provider);
        }
        List<TrendDataProvider> ordered = new ArrayList<>();
        for (String requested : Arrays.stream(properties.getProviders().split(",")).map(String::trim).toList()) {
            TrendDataProvider provider = byName.remove(requested);
            if (provider != null) {
                ordered.add(provider);
            } else if (!requested.isBlank()) {
                log.warn("Configured trend provider '{}' has no bean — skipping", requested);
            }
        }
        ordered.addAll(byName.values());
        this.chain = List.copyOf(ordered);
        log.info("Trend provider chain: {}", this.chain.stream().map(TrendDataProvider::name).toList());
    }

    /** Providers in resolution order (exposed for diagnostics/tests). */
    public List<TrendDataProvider> chain() {
        return chain;
    }

    /**
     * Fetches a raw series from the first provider that yields data.
     * Returns an empty result (source = "none") when nothing is available.
     */
    public ProviderResult fetch(String term, String geo, LocalDate from, LocalDate to) {
        for (TrendDataProvider provider : chain) {
            if (!provider.isAvailable()) {
                continue;
            }
            try {
                List<DailyPoint> points = provider.fetchDaily(term, geo, from, to);
                if (points != null && !points.isEmpty()) {
                    return new ProviderResult(provider.name(), points);
                }
            } catch (RuntimeException ex) {
                log.warn("Provider '{}' failed for term '{}': {}", provider.name(), term, ex.getMessage());
            }
        }
        return new ProviderResult("none", List.of());
    }

    /** Merged completions from every provider, de-duplicated, order preserved. */
    public List<String> suggest(String prefix, int limit) {
        List<String> merged = new ArrayList<>();
        for (TrendDataProvider provider : chain) {
            if (!provider.isAvailable() || merged.size() >= limit) {
                continue;
            }
            try {
                for (String suggestion : provider.suggest(prefix, limit)) {
                    if (merged.size() >= limit) {
                        break;
                    }
                    boolean duplicate = merged.stream()
                            .anyMatch(existing -> TermKeys.key(existing).equals(TermKeys.key(suggestion)));
                    if (!duplicate) {
                        merged.add(suggestion);
                    }
                }
            } catch (RuntimeException ex) {
                log.debug("Provider '{}' suggest failed: {}", provider.name(), ex.getMessage());
            }
        }
        return merged;
    }

    /** A raw series plus the provider that produced it. */
    public record ProviderResult(String source, List<DailyPoint> points) {
        public boolean isEmpty() {
            return points == null || points.isEmpty();
        }
    }
}
