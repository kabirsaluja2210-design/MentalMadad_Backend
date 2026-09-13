package com.mentalmadad.scheduler;

import com.mentalmadad.entity.TrackedTerm;
import com.mentalmadad.entity.TrendAlert;
import com.mentalmadad.entity.enums.AlertType;
import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.repository.TrackedTermRepository;
import com.mentalmadad.repository.TrendAlertRepository;
import com.mentalmadad.service.SubscriptionService;
import com.mentalmadad.service.TrendService;
import com.mentalmadad.trends.SeriesCache;
import com.mentalmadad.trends.TrendAnalytics;
import com.mentalmadad.trends.TrendCatalog;
import com.mentalmadad.trends.TrendNormalizer.IndexedPoint;
import com.mentalmadad.trends.TrendsProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * Nightly job that keeps the product's promise of fresh daily data and fast
 * answers: it pulls the new day for everything users watch (plus the curated
 * board), writes it to the snapshot table, and raises alerts on terms that
 * moved.
 *
 * Design Notes:
 * - Runs after the upstream dailies land (default 03:15 UTC, configurable via
 *   {@code app.trends.refresh-cron}) and can be switched off per instance with
 *   {@code app.trends.refresh-enabled=false} — important when several replicas
 *   share one database and only one should do the warming.
 * - Alerts are only created for accounts whose plan includes them, and at most
 *   one per term per day (enforced by a unique constraint as well as a check),
 *   so a user cannot be spammed by a term that stays elevated for a week.
 * - One term's failure never aborts the run.
 */
@Component
public class TrendRefreshJob {

    private static final Logger log = LoggerFactory.getLogger(TrendRefreshJob.class);

    private final TrendService trendService;
    private final TrackedTermRepository trackedTermRepository;
    private final TrendAlertRepository alertRepository;
    private final SubscriptionService subscriptionService;
    private final SeriesCache cache;
    private final TrendsProperties properties;

    public TrendRefreshJob(TrendService trendService,
                           TrackedTermRepository trackedTermRepository,
                           TrendAlertRepository alertRepository,
                           SubscriptionService subscriptionService,
                           SeriesCache cache,
                           TrendsProperties properties) {
        this.trendService = trendService;
        this.trackedTermRepository = trackedTermRepository;
        this.alertRepository = alertRepository;
        this.subscriptionService = subscriptionService;
        this.cache = cache;
        this.properties = properties;
    }

    @Scheduled(cron = "${app.trends.refresh-cron:0 15 3 * * *}", zone = "UTC")
    public void refreshDaily() {
        if (!properties.isRefreshEnabled()) {
            return;
        }
        long startedAt = System.currentTimeMillis();
        // Yesterday's data is new today, so every cached window is stale.
        cache.clear();

        int warmed = warmCuratedBoard();
        int checked = refreshTrackedTerms();

        log.info("Trend refresh finished in {} ms (curated warmed={}, tracked checked={})",
                System.currentTimeMillis() - startedAt, warmed, checked);
    }

    /** Pre-computes the public trending board so the first visitor of the day is not the one paying for it. */
    private int warmCuratedBoard() {
        int warmed = 0;
        for (String geo : TrendCatalog.regions().keySet()) {
            try {
                trendService.trendingNow(geo, null, 12);
                warmed++;
            } catch (RuntimeException ex) {
                log.warn("Could not warm trending board for {}: {}", geo, ex.getMessage());
            }
        }
        return warmed;
    }

    /** Refreshes every watched term and raises alerts for the accounts entitled to them. */
    private int refreshTrackedTerms() {
        List<TrackedTerm> tracked = trackedTermRepository.findAll();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        int checked = 0;

        for (TrackedTerm term : tracked) {
            try {
                List<IndexedPoint> series = trendService.internalSeries(
                        term.getDisplayTerm(), term.getGeo(), properties.getRefreshWindowDays());
                if (series.isEmpty()) {
                    continue;
                }
                double latest = TrendAnalytics.latest(series);
                double momentum = TrendAnalytics.momentumPct(series);
                double zScore = TrendAnalytics.spikeZScore(series);

                term.setLastIndexValue(latest);
                term.setLastMomentumPct(momentum);
                term.setLastCheckedAt(LocalDateTime.now());
                trackedTermRepository.save(term);
                checked++;

                AlertType type = TrendAnalytics.classifyAlert(zScore);
                if (type == null) {
                    continue;
                }
                PlanTier plan = subscriptionService.effectivePlanFor(term.getUserId());
                if (!plan.isAlerts()) {
                    continue;
                }
                if (alertRepository.existsByUserIdAndTermKeyAndGeoAndDetectedOn(
                        term.getUserId(), term.getTermKey(), term.getGeo(), today)) {
                    continue;
                }
                alertRepository.save(TrendAlert.builder()
                        .userId(term.getUserId())
                        .termKey(term.getTermKey())
                        .displayTerm(term.getDisplayTerm())
                        .geo(term.getGeo())
                        .type(type)
                        .zScore(zScore)
                        .changePct(momentum)
                        .detectedOn(today)
                        .message(messageFor(term.getDisplayTerm(), term.getGeo(), type, zScore, momentum))
                        .build());
            } catch (RuntimeException ex) {
                log.warn("Refresh failed for tracked term '{}' ({}): {}",
                        term.getDisplayTerm(), term.getGeo(), ex.getMessage());
            }
        }
        return checked;
    }

    private static String messageFor(String term, String geo, AlertType type,
                                     double zScore, double momentumPct) {
        String region = TrendCatalog.regionLabel(geo);
        String verb = switch (type) {
            case BREAKOUT -> "broke out";
            case SPIKE -> "spiked";
            case DROP -> "dropped sharply";
        };
        return String.format("%s %s in %s — %.1fσ from its 28-day baseline (%+.0f%% week over week).",
                term, verb, region, zScore, momentumPct);
    }
}
