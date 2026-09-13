package com.mentalmadad.billing;

import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.entity.enums.SubscriptionStatus;

import java.time.LocalDateTime;

/**
 * Gateway-agnostic view of a webhook notification.
 *
 * Design Notes:
 * - GoF Adapter: each gateway translates its own event vocabulary into this
 *   one shape, so SubscriptionService applies billing state transitions
 *   without knowing a single provider-specific field name.
 * - {@code userId} may be null when the provider only sends its own ids; the
 *   service then resolves the account by customer/subscription id.
 */
public record BillingEvent(
        Type type,
        Long userId,
        PlanTier plan,
        SubscriptionStatus status,
        String providerCustomerId,
        String providerSubscriptionId,
        LocalDateTime currentPeriodEnd,
        boolean cancelAtPeriodEnd) {

    public enum Type {
        /** Checkout completed / subscription started. */
        ACTIVATED,
        /** Renewal, plan change, or cancel-at-period-end toggled. */
        UPDATED,
        /** Subscription ended — access degrades to FREE. */
        CANCELED,
        /** Payment failed — access is kept until the period end, flagged PAST_DUE. */
        PAYMENT_FAILED
    }
}
