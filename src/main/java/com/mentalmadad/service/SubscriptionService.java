package com.mentalmadad.service;

import com.mentalmadad.dto.request.CheckoutRequest;
import com.mentalmadad.dto.response.CheckoutResponse;
import com.mentalmadad.dto.response.PlanResponse;
import com.mentalmadad.dto.response.SubscriptionResponse;
import com.mentalmadad.entity.enums.PlanTier;

import java.util.List;

/**
 * Subscription lifecycle: what a user may do, what they are paying for, and
 * the transitions between those two states.
 *
 * SOLID DIP: talks to a {@link com.mentalmadad.billing.BillingGateway}
 * interface, never to a concrete payment provider.
 */
public interface SubscriptionService {

    /** Public pricing table. */
    List<PlanResponse> plans();

    /** The tier the account may use right now (FREE when nothing is active). */
    PlanTier effectivePlanFor(Long userId);

    /** Current subscription, creating the implicit FREE row on first access. */
    SubscriptionResponse current(Long userId);

    /** Opens hosted checkout for a paid tier. */
    CheckoutResponse startCheckout(Long userId, String email, CheckoutRequest request);

    /**
     * Activates a subscription through the local simulated gateway.
     * Rejected when a real payment provider is configured.
     */
    SubscriptionResponse confirmSimulatedCheckout(Long userId, String plan);

    /** Marks the subscription to stop renewing at the end of the paid period. */
    SubscriptionResponse cancel(Long userId);

    /** Verifies and applies a provider webhook payload. */
    void handleWebhook(String payload, String signatureHeader);
}
