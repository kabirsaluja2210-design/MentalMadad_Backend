package com.mentalmadad.service.impl;

import com.mentalmadad.billing.BillingEvent;
import com.mentalmadad.billing.BillingGateway;
import com.mentalmadad.billing.BillingProperties;
import com.mentalmadad.billing.CheckoutSession;
import com.mentalmadad.billing.MockBillingGateway;
import com.mentalmadad.dto.request.CheckoutRequest;
import com.mentalmadad.dto.response.CheckoutResponse;
import com.mentalmadad.dto.response.PlanResponse;
import com.mentalmadad.dto.response.SubscriptionResponse;
import com.mentalmadad.entity.Subscription;
import com.mentalmadad.entity.User;
import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.entity.enums.SubscriptionStatus;
import com.mentalmadad.exception.BadRequestException;
import com.mentalmadad.exception.ResourceNotFoundException;
import com.mentalmadad.repository.SubscriptionRepository;
import com.mentalmadad.repository.UserRepository;
import com.mentalmadad.service.SubscriptionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Default subscription service.
 *
 * Design Notes:
 * - Fail-open on entitlements, fail-closed on money: a user whose subscription
 *   row is missing is treated as FREE (the product still works), but a paid
 *   tier is only ever granted by a gateway event, never by a client request.
 * - Webhooks are matched to an account by, in order: the userId the gateway
 *   echoed back, then the provider subscription id, then the customer id. That
 *   ordering matters because Stripe's later events carry ids but no metadata
 *   unless it was set at creation time.
 */
@Service
public class SubscriptionServiceImpl implements SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionServiceImpl.class);

    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final BillingGateway billingGateway;
    private final BillingProperties billingProperties;

    public SubscriptionServiceImpl(SubscriptionRepository subscriptionRepository,
                                   UserRepository userRepository,
                                   BillingGateway billingGateway,
                                   BillingProperties billingProperties) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.billingGateway = billingGateway;
        this.billingProperties = billingProperties;
    }

    @Override
    public List<PlanResponse> plans() {
        List<PlanResponse> plans = new ArrayList<>();
        for (PlanTier tier : PlanTier.values()) {
            plans.add(PlanResponse.builder()
                    .id(tier.name())
                    .name(tier.getDisplayName())
                    .priceMinorUnits(tier.getMonthlyPriceMinorUnits())
                    .currency(billingProperties.getCurrency())
                    .dailyQueryLimit(tier.getDailyQueryLimit())
                    .maxCompareTerms(tier.getMaxCompareTerms())
                    .maxHistoryDays(tier.getMaxHistoryDays())
                    .maxWatchlistTerms(tier.getMaxWatchlistTerms())
                    .csvExport(tier.isCsvExport())
                    .alerts(tier.isAlerts())
                    .apiAccess(tier.isApiAccess())
                    .features(featuresOf(tier))
                    .recommended(tier == PlanTier.PRO)
                    .build());
        }
        return plans;
    }

    @Override
    @Transactional(readOnly = true)
    public PlanTier effectivePlanFor(Long userId) {
        return subscriptionRepository.findByUserId(userId)
                .map(Subscription::effectivePlan)
                .orElse(PlanTier.FREE);
    }

    @Override
    @Transactional
    public SubscriptionResponse current(Long userId) {
        return toResponse(loadOrCreate(userId));
    }

    @Override
    @Transactional
    public CheckoutResponse startCheckout(Long userId, String email, CheckoutRequest request) {
        PlanTier plan = PlanTier.fromNullable(request.getPlan());
        if (!plan.isPaid()) {
            throw new BadRequestException("Choose a paid plan (PRO or BUSINESS) to start checkout");
        }
        if (!billingGateway.isConfigured()) {
            throw new BadRequestException(
                    "Billing is not configured on this deployment (app.billing.provider="
                            + billingProperties.getProvider() + ")");
        }
        String successUrl = blankTo(request.getSuccessUrl(), billingProperties.getSuccessUrl());
        String cancelUrl = blankTo(request.getCancelUrl(), billingProperties.getCancelUrl());

        CheckoutSession session = billingGateway.createCheckout(userId, email, plan, successUrl, cancelUrl);

        // Remember the intent so a webhook that arrives without plan metadata
        // still knows which tier was purchased.
        Subscription subscription = loadOrCreate(userId);
        if (subscription.effectivePlan() == PlanTier.FREE) {
            subscription.setPlan(plan);
            subscription.setStatus(SubscriptionStatus.INCOMPLETE);
            subscriptionRepository.save(subscription);
        }

        return CheckoutResponse.builder()
                .sessionId(session.sessionId())
                .checkoutUrl(session.url())
                .provider(session.provider())
                .plan(plan.name())
                .simulated(MockBillingGateway.NAME.equals(session.provider()))
                .build();
    }

    @Override
    @Transactional
    public SubscriptionResponse confirmSimulatedCheckout(Long userId, String plan) {
        if (!(billingGateway instanceof MockBillingGateway mock)) {
            throw new BadRequestException(
                    "Simulated activation is disabled when a real payment provider is configured");
        }
        PlanTier tier = PlanTier.fromNullable(plan);
        if (!tier.isPaid()) {
            throw new BadRequestException("Choose a paid plan (PRO or BUSINESS)");
        }
        apply(mock.simulatedActivation(userId, tier));
        return current(userId);
    }

    @Override
    @Transactional
    public SubscriptionResponse cancel(Long userId) {
        Subscription subscription = loadOrCreate(userId);
        if (!subscription.getPlan().isPaid()) {
            throw new BadRequestException("There is no paid subscription to cancel");
        }
        billingGateway.cancelAtPeriodEnd(subscription.getProviderSubscriptionId());
        subscription.setCancelAtPeriodEnd(true);
        if (subscription.getCurrentPeriodEnd() == null) {
            // Mock gateway: no provider period to honour, so end it now.
            subscription.setStatus(SubscriptionStatus.CANCELED);
            subscription.setPlan(PlanTier.FREE);
        }
        return toResponse(subscriptionRepository.save(subscription));
    }

    @Override
    @Transactional
    public void handleWebhook(String payload, String signatureHeader) {
        // A SecurityException from the gateway propagates: an unverified payload
        // is never applied, and the controller turns it into 400.
        billingGateway.parseWebhook(payload, signatureHeader).ifPresent(this::apply);
    }

    /** Applies a verified gateway event to the account's subscription row. */
    private void apply(BillingEvent event) {
        Optional<Subscription> found = resolve(event);
        if (found.isEmpty()) {
            log.warn("Billing event {} could not be matched to an account (sub={}, cus={})",
                    event.type(), event.providerSubscriptionId(), event.providerCustomerId());
            return;
        }
        Subscription subscription = found.get();

        if (event.providerCustomerId() != null) {
            subscription.setProviderCustomerId(event.providerCustomerId());
        }
        if (event.providerSubscriptionId() != null) {
            subscription.setProviderSubscriptionId(event.providerSubscriptionId());
        }
        if (event.currentPeriodEnd() != null) {
            subscription.setCurrentPeriodEnd(event.currentPeriodEnd());
        }

        switch (event.type()) {
            case ACTIVATED -> {
                if (event.plan() != null && event.plan().isPaid()) {
                    subscription.setPlan(event.plan());
                }
                subscription.setStatus(SubscriptionStatus.ACTIVE);
                subscription.setCancelAtPeriodEnd(false);
                if (subscription.getCurrentPeriodEnd() == null) {
                    subscription.setCurrentPeriodEnd(LocalDateTime.now().plusMonths(1));
                }
            }
            case UPDATED -> {
                if (event.plan() != null && event.plan().isPaid()) {
                    subscription.setPlan(event.plan());
                }
                if (event.status() != null) {
                    subscription.setStatus(event.status());
                }
                subscription.setCancelAtPeriodEnd(event.cancelAtPeriodEnd());
            }
            case CANCELED -> {
                subscription.setStatus(SubscriptionStatus.CANCELED);
                subscription.setPlan(PlanTier.FREE);
                subscription.setCancelAtPeriodEnd(false);
            }
            // Access is deliberately retained until the period end: dunning is
            // the provider's job, and cutting a paying customer off on the first
            // failed retry is worse than a few extra days of service.
            case PAYMENT_FAILED -> subscription.setStatus(SubscriptionStatus.PAST_DUE);
        }
        subscriptionRepository.save(subscription);
        log.info("Applied billing event {} to user {} -> plan={} status={}",
                event.type(), subscription.getUser().getId(),
                subscription.getPlan(), subscription.getStatus());
    }

    private Optional<Subscription> resolve(BillingEvent event) {
        if (event.userId() != null) {
            return Optional.of(loadOrCreate(event.userId()));
        }
        if (event.providerSubscriptionId() != null) {
            Optional<Subscription> bySubscription =
                    subscriptionRepository.findByProviderSubscriptionId(event.providerSubscriptionId());
            if (bySubscription.isPresent()) {
                return bySubscription;
            }
        }
        if (event.providerCustomerId() != null) {
            return subscriptionRepository.findByProviderCustomerId(event.providerCustomerId());
        }
        return Optional.empty();
    }

    private Subscription loadOrCreate(Long userId) {
        return subscriptionRepository.findByUserId(userId).orElseGet(() -> {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));
            return subscriptionRepository.save(Subscription.builder()
                    .user(user)
                    .plan(PlanTier.FREE)
                    .status(SubscriptionStatus.ACTIVE)
                    .build());
        });
    }

    private SubscriptionResponse toResponse(Subscription subscription) {
        return SubscriptionResponse.builder()
                .plan(subscription.getPlan().name())
                .effectivePlan(subscription.effectivePlan().name())
                .status(subscription.getStatus().name())
                .currentPeriodEnd(subscription.getCurrentPeriodEnd())
                .cancelAtPeriodEnd(subscription.isCancelAtPeriodEnd())
                .provider(billingGateway.name())
                .build();
    }

    private static List<String> featuresOf(PlanTier tier) {
        List<String> features = new ArrayList<>();
        features.add(String.format("%,d trend queries per day", tier.getDailyQueryLimit()));
        features.add("Compare up to " + tier.getMaxCompareTerms() + " terms at once");
        features.add(historyLabel(tier.getMaxHistoryDays()) + " of daily history");
        features.add(tier.getMaxWatchlistTerms() + " watchlist terms");
        features.add(tier.isAlerts() ? "Daily spike & breakout alerts" : "Alerts not included");
        features.add(tier.isCsvExport() ? "CSV export" : "No CSV export");
        if (tier.isApiAccess()) {
            features.add("Programmatic API access");
        }
        return features;
    }

    private static String historyLabel(int days) {
        if (days >= 365) {
            int years = days / 365;
            return years + (years == 1 ? " year" : " years");
        }
        return days + " days";
    }

    private static String blankTo(String value, String fallback) {
        return (value == null || value.isBlank()) ? fallback : value;
    }
}
