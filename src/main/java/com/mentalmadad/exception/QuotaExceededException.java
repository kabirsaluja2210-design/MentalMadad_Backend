package com.mentalmadad.exception;

import com.mentalmadad.entity.enums.PlanTier;

/**
 * Raised when a request would exceed the caller's plan entitlements.
 *
 * Mapped to HTTP 402 Payment Required by GlobalExceptionHandler — the status
 * that tells the frontend to show an upgrade prompt rather than an error toast.
 * Carries the tier that would satisfy the request so the UI can deep-link
 * straight to the right pricing card.
 */
public class QuotaExceededException extends RuntimeException {

    private final PlanTier currentPlan;
    private final PlanTier requiredPlan;

    public QuotaExceededException(String message, PlanTier currentPlan, PlanTier requiredPlan) {
        super(message);
        this.currentPlan = currentPlan;
        this.requiredPlan = requiredPlan;
    }

    public PlanTier getCurrentPlan() {
        return currentPlan;
    }

    public PlanTier getRequiredPlan() {
        return requiredPlan;
    }
}
