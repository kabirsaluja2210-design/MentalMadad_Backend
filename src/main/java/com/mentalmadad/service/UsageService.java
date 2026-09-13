package com.mentalmadad.service;

import com.mentalmadad.entity.enums.PlanTier;

/**
 * Daily query metering behind the subscription quotas.
 *
 * SOLID SRP: counting and enforcing "how many queries has this account made
 * today" lives here alone, so TrendService never touches counter rows and
 * quota rules are changed in one place.
 */
public interface UsageService {

    /**
     * Records one query against today's quota.
     *
     * @throws com.mentalmadad.exception.QuotaExceededException when the plan's
     *         daily limit is already reached
     */
    void consumeQuery(Long userId, PlanTier plan);

    /** Queries the account has made today. */
    int usedToday(Long userId);
}
