package com.mentalmadad.service.impl;

import com.mentalmadad.dto.request.TrackTermRequest;
import com.mentalmadad.dto.response.TrackedTermResponse;
import com.mentalmadad.dto.response.TrendAlertResponse;
import com.mentalmadad.entity.TrackedTerm;
import com.mentalmadad.entity.TrendAlert;
import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.exception.QuotaExceededException;
import com.mentalmadad.exception.ResourceNotFoundException;
import com.mentalmadad.repository.TrackedTermRepository;
import com.mentalmadad.repository.TrendAlertRepository;
import com.mentalmadad.service.SubscriptionService;
import com.mentalmadad.service.WatchlistService;
import com.mentalmadad.trends.TermKeys;
import com.mentalmadad.trends.TrendAnalytics;
import com.mentalmadad.trends.TrendCatalog;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WatchlistServiceImpl implements WatchlistService {

    private final TrackedTermRepository trackedTermRepository;
    private final TrendAlertRepository alertRepository;
    private final SubscriptionService subscriptionService;

    public WatchlistServiceImpl(TrackedTermRepository trackedTermRepository,
                                TrendAlertRepository alertRepository,
                                SubscriptionService subscriptionService) {
        this.trackedTermRepository = trackedTermRepository;
        this.alertRepository = alertRepository;
        this.subscriptionService = subscriptionService;
    }

    @Override
    @Transactional(readOnly = true)
    public List<TrackedTermResponse> list(Long userId) {
        return trackedTermRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(WatchlistServiceImpl::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public TrackedTermResponse add(Long userId, TrackTermRequest request) {
        String display = TermKeys.display(request.getTerm());
        if (display.isEmpty()) {
            throw new BadRequestException("A term is required");
        }
        String termKey = TermKeys.key(display);
        String geo = TermKeys.geo(request.getGeo());
        if (!TrendCatalog.isKnownRegion(geo)) {
            geo = TrendCatalog.WORLDWIDE;
        }

        // Re-adding an existing term is a no-op rather than an error: the UI
        // treats "track" as idempotent.
        final String resolvedGeo = geo;
        return trackedTermRepository.findByUserIdAndTermKeyAndGeo(userId, termKey, resolvedGeo)
                .map(WatchlistServiceImpl::toResponse)
                .orElseGet(() -> {
                    PlanTier plan = subscriptionService.effectivePlanFor(userId);
                    long used = trackedTermRepository.countByUserId(userId);
                    if (used >= plan.getMaxWatchlistTerms()) {
                        throw new QuotaExceededException(
                                "The " + plan.getDisplayName() + " plan tracks up to "
                                        + plan.getMaxWatchlistTerms() + " terms.",
                                plan, plan == PlanTier.FREE ? PlanTier.PRO : PlanTier.BUSINESS);
                    }
                    TrackedTerm saved = trackedTermRepository.save(TrackedTerm.builder()
                            .userId(userId)
                            .termKey(termKey)
                            .displayTerm(display)
                            .geo(resolvedGeo)
                            .build());
                    return toResponse(saved);
                });
    }

    @Override
    @Transactional
    public void remove(Long userId, Long trackedTermId) {
        TrackedTerm tracked = trackedTermRepository.findByIdAndUserId(trackedTermId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Tracked term not found"));
        trackedTermRepository.delete(tracked);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TrendAlertResponse> alerts(Long userId) {
        return alertRepository.findTop50ByUserIdOrderByDetectedOnDescIdDesc(userId).stream()
                .map(WatchlistServiceImpl::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public TrendAlertResponse markAlertRead(Long userId, Long alertId) {
        TrendAlert alert = alertRepository.findByIdAndUserId(alertId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Alert not found"));
        alert.setRead(true);
        return toResponse(alertRepository.save(alert));
    }

    private static TrackedTermResponse toResponse(TrackedTerm tracked) {
        double momentum = tracked.getLastMomentumPct() == null ? 0d : tracked.getLastMomentumPct();
        return TrackedTermResponse.builder()
                .id(tracked.getId())
                .term(tracked.getDisplayTerm())
                .geo(tracked.getGeo())
                .geoLabel(TrendCatalog.regionLabel(tracked.getGeo()))
                .latest(tracked.getLastIndexValue())
                .momentumPct(tracked.getLastMomentumPct())
                .status(tracked.getLastCheckedAt() == null
                        ? "Pending" : TrendAnalytics.status(momentum, 0d))
                .lastCheckedAt(tracked.getLastCheckedAt())
                .createdAt(tracked.getCreatedAt())
                .build();
    }

    private static TrendAlertResponse toResponse(TrendAlert alert) {
        return TrendAlertResponse.builder()
                .id(alert.getId())
                .term(alert.getDisplayTerm())
                .geo(alert.getGeo())
                .type(alert.getType().name())
                .zScore(alert.getZScore())
                .changePct(alert.getChangePct())
                .detectedOn(alert.getDetectedOn())
                .message(alert.getMessage())
                .read(alert.isRead())
                .createdAt(alert.getCreatedAt())
                .build();
    }
}
