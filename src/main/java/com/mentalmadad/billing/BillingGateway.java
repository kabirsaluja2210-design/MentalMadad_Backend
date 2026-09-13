package com.mentalmadad.billing;

import com.mentalmadad.entity.enums.PlanTier;

import java.util.Optional;

/**
 * Payment provider abstraction.
 *
 * Design Notes:
 * - GoF Strategy: exactly one implementation is active per deployment, chosen
 *   by {@code app.billing.provider}. The service layer depends on this
 *   interface only, so swapping Stripe for another processor — or running the
 *   mock in CI — never touches business logic.
 * - Card data never reaches this application: gateways return a hosted
 *   checkout URL and report back over signed webhooks.
 */
public interface BillingGateway {

    String name();

    /** True when the gateway is configured well enough to take a payment. */
    boolean isConfigured();

    /**
     * Opens a hosted checkout for {@code plan}.
     *
     * @param userId    account the subscription belongs to (round-tripped through
     *                  the provider so the webhook can be matched back)
     * @param email     customer email for the provider's receipt
     * @param plan      tier being purchased (must be a paid tier)
     */
    CheckoutSession createCheckout(Long userId, String email, PlanTier plan,
                                   String successUrl, String cancelUrl);

    /**
     * Verifies and translates a raw webhook body.
     *
     * @return the event, or empty when the payload is irrelevant. Implementations
     *         MUST throw {@link SecurityException} when the signature does not
     *         verify — an unverified payload is never applied.
     */
    Optional<BillingEvent> parseWebhook(String payload, String signatureHeader);

    /** Schedules cancellation at the end of the paid period. */
    void cancelAtPeriodEnd(String providerSubscriptionId);
}
