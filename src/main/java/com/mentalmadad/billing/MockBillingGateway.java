package com.mentalmadad.billing;

import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.entity.enums.SubscriptionStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Development/CI gateway: no network, no keys, no card.
 *
 * It returns a checkout URL pointing at the frontend's own simulated checkout
 * page, which then calls {@code POST /api/billing/confirm} to activate the
 * subscription. That keeps the dev flow shaped exactly like the Stripe one
 * (redirect out, come back, webhook-equivalent applies the change) so the UI
 * needs no branching between environments.
 *
 * Active by default; {@code app.billing.provider=stripe} replaces it.
 */
@Component
@ConditionalOnProperty(name = "app.billing.provider", havingValue = "mock", matchIfMissing = true)
public class MockBillingGateway implements BillingGateway {

    public static final String NAME = "mock";

    private final BillingProperties properties;

    public MockBillingGateway(BillingProperties properties) {
        this.properties = properties;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isConfigured() {
        return true;
    }

    @Override
    public CheckoutSession createCheckout(Long userId, String email, PlanTier plan,
                                          String successUrl, String cancelUrl) {
        String sessionId = "mock_cs_" + UUID.randomUUID().toString().replace("-", "");
        String base = (successUrl == null || successUrl.isBlank()) ? properties.getSuccessUrl() : successUrl;
        String url = base + (base.contains("?") ? "&" : "?")
                + "session_id=" + sessionId + "&plan=" + plan.name() + "&simulated=true";
        return new CheckoutSession(sessionId, url, NAME);
    }

    /**
     * The mock provider has no webhook: activation comes from the authenticated
     * confirm endpoint instead. Returning empty keeps the webhook route safe to
     * leave mounted in every environment.
     */
    @Override
    public Optional<BillingEvent> parseWebhook(String payload, String signatureHeader) {
        return Optional.empty();
    }

    @Override
    public void cancelAtPeriodEnd(String providerSubscriptionId) {
        // Nothing to call — the local subscription row is the source of truth here.
    }

    /** Builds the event the confirm endpoint applies, mirroring a real activation. */
    public BillingEvent simulatedActivation(Long userId, PlanTier plan) {
        return new BillingEvent(
                BillingEvent.Type.ACTIVATED,
                userId,
                plan,
                SubscriptionStatus.ACTIVE,
                "mock_cus_" + userId,
                "mock_sub_" + userId + "_" + plan.name().toLowerCase(),
                LocalDateTime.now().plusMonths(1),
                false);
    }
}
