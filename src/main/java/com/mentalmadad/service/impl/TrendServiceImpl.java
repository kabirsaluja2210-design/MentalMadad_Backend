package com.mentalmadad.service.impl;

import com.mentalmadad.dto.response.TrendComparisonResponse;
import com.mentalmadad.dto.response.TrendInsightResponse;
import com.mentalmadad.dto.response.TrendPointResponse;
import com.mentalmadad.dto.response.TrendSeriesResponse;
import com.mentalmadad.dto.response.TrendingTopicResponse;
import com.mentalmadad.dto.response.UsageResponse;
import com.mentalmadad.entity.TrendSnapshot;
import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.exception.QuotaExceededException;
import com.mentalmadad.repository.TrackedTermRepository;
import com.mentalmadad.repository.TrendAlertRepository;
import com.mentalmadad.repository.TrendSnapshotRepository;
import com.mentalmadad.service.SubscriptionService;
import com.mentalmadad.service.TrendService;
import com.mentalmadad.service.UsageService;
import com.mentalmadad.trends.DailyPoint;
import com.mentalmadad.trends.SeriesCache;
import com.mentalmadad.trends.TermKeys;
import com.mentalmadad.trends.TrendAnalytics;
import com.mentalmadad.trends.TrendCatalog;
import com.mentalmadad.trends.TrendNormalizer;
import com.mentalmadad.trends.TrendNormalizer.IndexedPoint;
import com.mentalmadad.trends.TrendProviderRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Core query path for TrendPulse.
 *
 * How a request is served (and why it is fast):
 *   1. in-process cache  — repeat of an identical window, microseconds;
 *   2. snapshot table    — the days we already stored, one indexed read;
 *   3. upstream provider — only the days we are missing, then written back.
 * Steps 1 and 2 mean a term that anyone has queried today, or that the nightly
 * job warmed, never touches the network again.
 *
 * Entitlements enforced here:
 *   - daily query quota (one unit per term in the request);
 *   - history depth per plan;
 *   - number of terms per comparison;
 *   - forecast and CSV export on paid plans only.
 */
@Service
public class TrendServiceImpl implements TrendService {

    private static final Logger log = LoggerFactory.getLogger(TrendServiceImpl.class);

    /** Upstream dailies land a day late, so "today" for the product is yesterday. */
    private static final int SOURCE_LAG_DAYS = 1;
    private static final int SMOOTHING_WINDOW = 7;
    private static final int FORECAST_HORIZON_DAYS = 14;
    private static final int MIN_DAYS = 7;
    private static final int SPARKLINE_POINTS = 14;
    private static final int TRENDING_WINDOW_DAYS = 60;
    private static final int MAX_TRENDING_TERMS = 24;

    private final TrendProviderRegistry providers;
    private final TrendSnapshotRepository snapshotRepository;
    private final TrackedTermRepository trackedTermRepository;
    private final TrendAlertRepository alertRepository;
    private final SeriesCache cache;
    private final SubscriptionService subscriptionService;
    private final UsageService usageService;

    public TrendServiceImpl(TrendProviderRegistry providers,
                            TrendSnapshotRepository snapshotRepository,
                            TrackedTermRepository trackedTermRepository,
                            TrendAlertRepository alertRepository,
                            SeriesCache cache,
                            SubscriptionService subscriptionService,
                            UsageService usageService) {
        this.providers = providers;
        this.snapshotRepository = snapshotRepository;
        this.trackedTermRepository = trackedTermRepository;
        this.alertRepository = alertRepository;
        this.cache = cache;
        this.subscriptionService = subscriptionService;
        this.usageService = usageService;
    }

    // ---------------------------------------------------------------- queries

    @Override
    @Transactional
    public TrendSeriesResponse series(Long userId, String term, String geo, int days) {
        long startedAt = System.nanoTime();
        String display = requireTerm(term);
        String region = region(geo);

        PlanTier plan = subscriptionService.effectivePlanFor(userId);
        int window = windowFor(plan, days);
        usageService.consumeQuery(userId, plan);

        LocalDate to = latestAvailableDay();
        LocalDate from = to.minusDays(window - 1L);

        SeriesData data = load(display, region, from, to);
        double maximum = TrendNormalizer.sharedMaximum(List.of(data.raw()));
        List<IndexedPoint> indexed = TrendNormalizer.toIndex(data.raw(), maximum);

        List<IndexedPoint> forecast = plan.isPaid()
                ? TrendAnalytics.forecast(indexed, FORECAST_HORIZON_DAYS)
                : List.of();

        return TrendSeriesResponse.builder()
                .term(display)
                .geo(region)
                .geoLabel(TrendCatalog.regionLabel(region))
                .from(from)
                .to(to)
                .points(toDto(indexed))
                .smoothed(toDto(TrendNormalizer.smooth(indexed, SMOOTHING_WINDOW)))
                .forecast(toDto(forecast))
                .insight(insightOf(indexed))
                .source(data.source())
                .cached(data.fromCache())
                .latencyMs(millisSince(startedAt))
                .build();
    }

    @Override
    @Transactional
    public TrendComparisonResponse compare(Long userId, String termsCsv, String geo, int days) {
        long startedAt = System.nanoTime();
        List<String> terms = TermKeys.splitTerms(termsCsv);
        if (terms.isEmpty()) {
            throw new BadRequestException("Provide at least one term to compare");
        }
        String region = region(geo);
        PlanTier plan = subscriptionService.effectivePlanFor(userId);

        if (terms.size() > plan.getMaxCompareTerms()) {
            throw new QuotaExceededException(
                    "The " + plan.getDisplayName() + " plan compares up to "
                            + plan.getMaxCompareTerms() + " terms at once (you asked for "
                            + terms.size() + ").",
                    plan, upgradeFor(plan));
        }
        int window = windowFor(plan, days);
        for (int i = 0; i < terms.size(); i++) {
            // One quota unit per term — a 5-term comparison costs five queries.
            usageService.consumeQuery(userId, plan);
        }

        LocalDate to = latestAvailableDay();
        LocalDate from = to.minusDays(window - 1L);

        List<SeriesData> loaded = new ArrayList<>();
        for (String term : terms) {
            loaded.add(load(term, region, from, to));
        }
        // Google-Trends semantics: every line is scaled against ONE maximum so
        // the comparison shows relative size, not each term's own shape.
        double sharedMax = TrendNormalizer.sharedMaximum(loaded.stream().map(SeriesData::raw).toList());

        List<TrendSeriesResponse> series = new ArrayList<>();
        List<List<IndexedPoint>> indexedAll = new ArrayList<>();
        String leader = terms.get(0);
        double leaderPeak = -1d;

        for (int i = 0; i < terms.size(); i++) {
            SeriesData data = loaded.get(i);
            List<IndexedPoint> indexed = TrendNormalizer.toIndex(data.raw(), sharedMax);
            indexedAll.add(indexed);

            IndexedPoint peak = TrendAnalytics.peak(indexed);
            if (peak != null && peak.value() > leaderPeak) {
                leaderPeak = peak.value();
                leader = terms.get(i);
            }
            series.add(TrendSeriesResponse.builder()
                    .term(terms.get(i))
                    .geo(region)
                    .geoLabel(TrendCatalog.regionLabel(region))
                    .from(from)
                    .to(to)
                    .points(toDto(indexed))
                    .smoothed(toDto(TrendNormalizer.smooth(indexed, SMOOTHING_WINDOW)))
                    .forecast(List.of())
                    .insight(insightOf(indexed))
                    .source(data.source())
                    .cached(data.fromCache())
                    .latencyMs(0)
                    .build());
        }

        Map<String, Double> correlations = new LinkedHashMap<>();
        for (int i = 0; i < terms.size(); i++) {
            for (int j = i + 1; j < terms.size(); j++) {
                correlations.put(terms.get(i) + "|" + terms.get(j),
                        TrendAnalytics.correlation(indexedAll.get(i), indexedAll.get(j)));
            }
        }

        return TrendComparisonResponse.builder()
                .geo(region)
                .geoLabel(TrendCatalog.regionLabel(region))
                .from(from)
                .to(to)
                .series(series)
                .correlations(correlations)
                .leader(leader)
                .latencyMs(millisSince(startedAt))
                .build();
    }

    @Override
    @Transactional
    public List<TrendingTopicResponse> trendingNow(String geo, String category, int limit) {
        String region = region(geo);
        int size = Math.max(1, Math.min(limit, MAX_TRENDING_TERMS));
        String cacheKey = "board|" + region + "|" + (category == null ? "" : category.toLowerCase())
                + "|" + size + "|" + latestAvailableDay();

        return cache.get(cacheKey, () -> {
            List<String> terms = TrendCatalog.termsForCategory(category).stream().limit(size).toList();
            LocalDate to = latestAvailableDay();
            LocalDate from = to.minusDays(TRENDING_WINDOW_DAYS - 1L);

            List<TrendingTopicResponse> board = new ArrayList<>();
            for (String term : terms) {
                SeriesData data = load(term, region, from, to);
                double maximum = TrendNormalizer.sharedMaximum(List.of(data.raw()));
                List<IndexedPoint> indexed = TrendNormalizer.toIndex(data.raw(), maximum);
                double momentum = TrendAnalytics.momentumPct(indexed);
                double zScore = TrendAnalytics.spikeZScore(indexed);

                board.add(TrendingTopicResponse.builder()
                        .term(term)
                        .category(categoryOf(term))
                        .latest(TrendAnalytics.latest(indexed))
                        .momentumPct(momentum)
                        .status(TrendAnalytics.status(momentum, zScore))
                        .sparkline(sparklineOf(indexed))
                        .build());
            }
            board.sort((a, b) -> Double.compare(b.getMomentumPct(), a.getMomentumPct()));
            return board;
        });
    }

    @Override
    public List<String> suggest(String prefix, int limit) {
        int size = Math.max(1, Math.min(limit, 20));
        String key = "suggest|" + TermKeys.key(prefix) + "|" + size;
        return cache.get(key, () -> {
            List<String> merged = new ArrayList<>(providers.suggest(prefix, size));
            if (merged.size() < size) {
                String needle = TermKeys.key(prefix);
                for (String curated : TrendCatalog.allCuratedTerms()) {
                    if (merged.size() >= size) {
                        break;
                    }
                    boolean matches = needle.isEmpty() || TermKeys.key(curated).contains(needle);
                    boolean duplicate = merged.stream()
                            .anyMatch(existing -> TermKeys.key(existing).equals(TermKeys.key(curated)));
                    if (matches && !duplicate) {
                        merged.add(curated);
                    }
                }
            }
            return merged;
        });
    }

    @Override
    @Transactional
    public String exportCsv(Long userId, String termsCsv, String geo, int days) {
        PlanTier plan = subscriptionService.effectivePlanFor(userId);
        if (!plan.isCsvExport()) {
            throw new QuotaExceededException(
                    "CSV export is available on the Pro and Business plans.", plan, PlanTier.PRO);
        }
        TrendComparisonResponse comparison = compare(userId, termsCsv, geo, days);

        StringBuilder csv = new StringBuilder("date,term,geo,index,raw_value\n");
        for (TrendSeriesResponse series : comparison.getSeries()) {
            for (TrendPointResponse point : series.getPoints()) {
                csv.append(point.getDate()).append(',')
                        .append(csvCell(series.getTerm())).append(',')
                        .append(series.getGeo()).append(',')
                        .append(point.getValue()).append(',')
                        .append(point.getRawValue()).append('\n');
            }
        }
        return csv.toString();
    }

    @Override
    @Transactional(readOnly = true)
    public UsageResponse usage(Long userId) {
        PlanTier plan = subscriptionService.effectivePlanFor(userId);
        int used = usageService.usedToday(userId);
        return UsageResponse.builder()
                .plan(plan.name())
                .used(used)
                .limit(plan.getDailyQueryLimit())
                .remaining(Math.max(0, plan.getDailyQueryLimit() - used))
                .watchlistUsed(trackedTermRepository.countByUserId(userId))
                .watchlistLimit(plan.getMaxWatchlistTerms())
                .unreadAlerts(alertRepository.countByUserIdAndReadFalse(userId))
                .cacheHitRatePct(cache.hitRatePct())
                .cachedSeries(cache.size())
                .storedTerms(snapshotRepository.countDistinctTerms())
                .build();
    }

    @Override
    @Transactional
    public List<IndexedPoint> internalSeries(String term, String geo, int days) {
        LocalDate to = latestAvailableDay();
        LocalDate from = to.minusDays(Math.max(MIN_DAYS, days) - 1L);
        SeriesData data = load(term, region(geo), from, to);
        return TrendNormalizer.toIndex(data.raw(), TrendNormalizer.sharedMaximum(List.of(data.raw())));
    }

    // ------------------------------------------------------------ data access

    /**
     * Cache -> snapshots -> upstream, writing back whatever the upstream gave.
     * Never throws for an unknown term: an empty series is a legitimate answer
     * ("no interest data"), and the chart renders it as a flat line.
     */
    private SeriesData load(String term, String geo, LocalDate from, LocalDate to) {
        String termKey = TermKeys.key(term);
        String cacheKey = "series|" + termKey + "|" + geo + "|" + from + "|" + to;

        SeriesCache.Lookup<SeriesData> lookup =
                cache.lookup(cacheKey, () -> fetchAndStore(term, termKey, geo, from, to));
        return lookup.value().withCached(lookup.hit());
    }

    private SeriesData fetchAndStore(String term, String termKey, String geo,
                                     LocalDate from, LocalDate to) {
        List<TrendSnapshot> stored = snapshotRepository
                .findByTermKeyAndGeoAndObservedOnBetweenOrderByObservedOnAsc(termKey, geo, from, to);

        long expectedDays = to.toEpochDay() - from.toEpochDay() + 1;
        boolean coversWindow = stored.size() >= expectedDays;
        boolean hasLatestDay = stored.stream().anyMatch(s -> s.getObservedOn().equals(to));

        if (coversWindow && hasLatestDay) {
            String source = stored.get(stored.size() - 1).getSource();
            return new SeriesData(source,
                    stored.stream().map(s -> new DailyPoint(s.getObservedOn(), s.getRawValue())).toList(),
                    from, to, false);
        }

        TrendProviderRegistry.ProviderResult result = providers.fetch(term, geo, from, to);
        if (result.isEmpty()) {
            // Upstream had nothing: serve whatever history we already hold.
            List<DailyPoint> fallback = stored.stream()
                    .map(s -> new DailyPoint(s.getObservedOn(), s.getRawValue()))
                    .toList();
            return new SeriesData(stored.isEmpty() ? "none" : stored.get(0).getSource(),
                    TrendNormalizer.densify(fallback, from, to), from, to, false);
        }

        persistNew(term, termKey, geo, result, stored);
        return new SeriesData(result.source(),
                TrendNormalizer.densify(result.points(), from, to), from, to, false);
    }

    /** Writes back only the days we did not already have, in one batch. */
    private void persistNew(String term, String termKey, String geo,
                            TrendProviderRegistry.ProviderResult result,
                            List<TrendSnapshot> existing) {
        Set<LocalDate> known = new HashSet<>();
        for (TrendSnapshot snapshot : existing) {
            known.add(snapshot.getObservedOn());
        }
        String display = TermKeys.display(term);
        LocalDateTime fetchedAt = LocalDateTime.now();

        List<TrendSnapshot> fresh = new ArrayList<>();
        for (DailyPoint point : result.points()) {
            if (known.add(point.date())) {
                fresh.add(TrendSnapshot.builder()
                        .termKey(termKey)
                        .displayTerm(display)
                        .geo(geo)
                        .observedOn(point.date())
                        .rawValue(point.value())
                        .source(result.source())
                        .fetchedAt(fetchedAt)
                        .build());
            }
        }
        if (fresh.isEmpty()) {
            return;
        }
        try {
            snapshotRepository.saveAll(fresh);
        } catch (RuntimeException ex) {
            // A concurrent request may have written the same days first; the
            // unique constraint did its job and the data is already there.
            log.debug("Snapshot write for '{}' skipped: {}", termKey, ex.getMessage());
        }
    }

    // ---------------------------------------------------------------- helpers

    private TrendInsightResponse insightOf(List<IndexedPoint> indexed) {
        IndexedPoint peak = TrendAnalytics.peak(indexed);
        double momentum = TrendAnalytics.momentumPct(indexed);
        double zScore = TrendAnalytics.spikeZScore(indexed);
        return TrendInsightResponse.builder()
                .latest(TrendAnalytics.latest(indexed))
                .average(TrendAnalytics.average(indexed))
                .peak(peak == null ? 0d : peak.value())
                .peakDate(peak == null ? null : peak.date())
                .momentumPct(momentum)
                .spikeZScore(zScore)
                .status(TrendAnalytics.status(momentum, zScore))
                .build();
    }

    private static List<TrendPointResponse> toDto(List<IndexedPoint> points) {
        List<TrendPointResponse> dto = new ArrayList<>(points.size());
        for (IndexedPoint point : points) {
            dto.add(TrendPointResponse.builder()
                    .date(point.date())
                    .value(point.value())
                    .rawValue(point.rawValue())
                    .build());
        }
        return dto;
    }

    private static List<Double> sparklineOf(List<IndexedPoint> indexed) {
        int start = Math.max(0, indexed.size() - SPARKLINE_POINTS);
        List<Double> values = new ArrayList<>();
        for (int i = start; i < indexed.size(); i++) {
            values.add(indexed.get(i).value());
        }
        return values;
    }

    private static String categoryOf(String term) {
        for (Map.Entry<String, List<String>> entry : TrendCatalog.categories().entrySet()) {
            for (String candidate : entry.getValue()) {
                if (TermKeys.key(candidate).equals(TermKeys.key(term))) {
                    return entry.getKey();
                }
            }
        }
        return "Other";
    }

    /** Requested window, clamped to sane bounds and refused above the plan's depth. */
    private static int windowFor(PlanTier plan, int requestedDays) {
        int days = requestedDays <= 0 ? 90 : requestedDays;
        if (days < MIN_DAYS) {
            days = MIN_DAYS;
        }
        if (days > plan.getMaxHistoryDays()) {
            throw new QuotaExceededException(
                    "The " + plan.getDisplayName() + " plan includes " + plan.getMaxHistoryDays()
                            + " days of history (you asked for " + days + ").",
                    plan, upgradeFor(plan));
        }
        return days;
    }

    private static PlanTier upgradeFor(PlanTier plan) {
        return plan == PlanTier.FREE ? PlanTier.PRO : PlanTier.BUSINESS;
    }

    private static String requireTerm(String term) {
        String display = TermKeys.display(term);
        if (display.isEmpty()) {
            throw new BadRequestException("A search term is required");
        }
        return display;
    }

    private static String region(String geo) {
        String region = TermKeys.geo(geo);
        return TrendCatalog.isKnownRegion(region) ? region : TrendCatalog.WORLDWIDE;
    }

    /** Most recent day the upstreams have published. */
    private static LocalDate latestAvailableDay() {
        return LocalDate.now(ZoneOffset.UTC).minusDays(SOURCE_LAG_DAYS);
    }

    private static long millisSince(long startedAtNanos) {
        return Math.max(0L, (System.nanoTime() - startedAtNanos) / 1_000_000L);
    }

    private static String csvCell(String value) {
        if (value == null) {
            return "";
        }
        String escaped = value.replace("\"", "\"\"");
        return escaped.contains(",") || escaped.contains("\"") ? "\"" + escaped + "\"" : escaped;
    }

    /**
     * A loaded raw series plus provenance. {@code fromCache} is set by the
     * caller from the cache's own hit/miss answer, so the flag the API reports
     * is the truth rather than an inference.
     */
    private record SeriesData(String source, List<DailyPoint> raw,
                              LocalDate from, LocalDate to, boolean fromCache) {

        SeriesData withCached(boolean cached) {
            return cached == fromCache ? this : new SeriesData(source, raw, from, to, cached);
        }
    }
}
