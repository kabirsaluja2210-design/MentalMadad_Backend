package com.mentalmadad.trends;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * In-process TTL cache for computed series — the first of the two layers that
 * make repeat queries sub-millisecond (the second is the snapshot table).
 *
 * Design Notes:
 * - Deliberately dependency-free: a ConcurrentHashMap with per-entry expiry and
 *   a size cap, rather than pulling in a cache library for ~60 lines of logic.
 * - Eviction is "clear the oldest half when full", which is cheap and good
 *   enough for a cache whose entries all expire within minutes anyway.
 * - Hit/miss counters are exposed because the product's core claim is speed:
 *   /api/trends/usage reports the live hit rate.
 */
@Component
public class SeriesCache {

    private final TrendsProperties properties;
    private final Map<String, Entry> entries = new ConcurrentHashMap<>();
    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();

    public SeriesCache(TrendsProperties properties) {
        this.properties = properties;
    }

    /** Returns the cached value, or computes, stores and returns it. */
    @SuppressWarnings("unchecked")
    public <T> T get(String key, Supplier<T> loader) {
        long now = System.currentTimeMillis();
        Entry entry = entries.get(key);
        if (entry != null && entry.expiresAtMs > now) {
            hits.incrementAndGet();
            return (T) entry.value;
        }
        misses.incrementAndGet();
        T value = loader.get();
        put(key, value, now);
        return value;
    }

    /**
     * Same as {@link #get} but reports whether the value came from the cache.
     * Used by the query path, whose responses advertise a {@code cached} flag —
     * that flag has to be the truth, not an approximation.
     */
    @SuppressWarnings("unchecked")
    public <T> Lookup<T> lookup(String key, Supplier<T> loader) {
        long now = System.currentTimeMillis();
        Entry entry = entries.get(key);
        if (entry != null && entry.expiresAtMs > now) {
            hits.incrementAndGet();
            return new Lookup<>((T) entry.value, true);
        }
        misses.incrementAndGet();
        T value = loader.get();
        put(key, value, now);
        return new Lookup<>(value, false);
    }

    private void put(String key, Object value, long now) {
        if (entries.size() >= properties.getCacheMaxEntries()) {
            evictOldestHalf();
        }
        entries.put(key, new Entry(value, now + properties.getCacheTtlSeconds() * 1000L));
    }

    private void evictOldestHalf() {
        long now = System.currentTimeMillis();
        entries.entrySet().removeIf(e -> e.getValue().expiresAtMs <= now);
        if (entries.size() < properties.getCacheMaxEntries()) {
            return;
        }
        entries.entrySet().stream()
                .sorted((a, b) -> Long.compare(a.getValue().expiresAtMs, b.getValue().expiresAtMs))
                .limit(entries.size() / 2L)
                .map(Map.Entry::getKey)
                .toList()
                .forEach(entries::remove);
    }

    /** Drops every entry for a term so a refresh is visible immediately. */
    public void invalidateTerm(String termKey) {
        String needle = "|" + termKey + "|";
        entries.keySet().removeIf(key -> key.contains(needle));
    }

    public void clear() {
        entries.clear();
    }

    public long hitCount() {
        return hits.get();
    }

    public long missCount() {
        return misses.get();
    }

    public int size() {
        return entries.size();
    }

    /** Cache hit rate in percent, rounded to one decimal; 0 before any traffic. */
    public double hitRatePct() {
        long total = hits.get() + misses.get();
        return total == 0 ? 0d : Math.round((hits.get() * 1000d) / total) / 10d;
    }

    private record Entry(Object value, long expiresAtMs) {
    }

    /** A cache result together with whether it was a hit. */
    public record Lookup<T>(T value, boolean hit) {
    }
}
