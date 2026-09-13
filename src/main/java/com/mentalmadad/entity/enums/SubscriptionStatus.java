package com.mentalmadad.entity.enums;

/**
 * Lifecycle of a billing subscription, mirroring the states a payment
 * provider reports back over its webhook.
 *
 * Only ACTIVE and TRIALING grant the paid entitlements; every other state
 * degrades the account to {@link PlanTier#FREE} (see SubscriptionServiceImpl).
 */
public enum SubscriptionStatus {
    ACTIVE,
    TRIALING,
    PAST_DUE,
    CANCELED,
    INCOMPLETE;

    public boolean grantsAccess() {
        return this == ACTIVE || this == TRIALING;
    }
}
