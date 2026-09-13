package com.mentalmadad.service.impl;

import com.mentalmadad.entity.UsageCounter;
import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.exception.QuotaExceededException;
import com.mentalmadad.repository.UsageCounterRepository;
import com.mentalmadad.service.UsageService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Usage metering against a per-(user, day) counter row.
 *
 * Design Notes:
 * - The day boundary is UTC so a customer cannot reset their quota by changing
 *   device timezone, and so the limit means the same thing for every region.
 * - Increment is a single atomic UPDATE; the row is created on first use and a
 *   lost create-race is absorbed by retrying the update.
 * - Runs in REQUIRES_NEW so metering is committed even when the surrounding
 *   query later fails — a caller cannot burn provider capacity for free by
 *   triggering an error after the fetch.
 */
@Service
public class UsageServiceImpl implements UsageService {

    private final UsageCounterRepository usageCounterRepository;

    public UsageServiceImpl(UsageCounterRepository usageCounterRepository) {
        this.usageCounterRepository = usageCounterRepository;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void consumeQuery(Long userId, PlanTier plan) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        int used = usageCounterRepository.findByUserIdAndUsageDay(userId, today)
                .map(UsageCounter::getQueryCount)
                .orElse(0);

        if (used >= plan.getDailyQueryLimit()) {
            PlanTier upgrade = plan == PlanTier.BUSINESS ? PlanTier.BUSINESS : nextTier(plan);
            throw new QuotaExceededException(
                    "Daily query limit reached for the " + plan.getDisplayName() + " plan ("
                            + plan.getDailyQueryLimit() + " queries/day). Limits reset at 00:00 UTC.",
                    plan, upgrade);
        }

        if (usageCounterRepository.incrementCount(userId, today, 1) == 0) {
            try {
                usageCounterRepository.save(UsageCounter.builder()
                        .userId(userId)
                        .usageDay(today)
                        .queryCount(1)
                        .build());
            } catch (DataIntegrityViolationException raceLost) {
                // Another request created today's row first — apply our increment to it.
                usageCounterRepository.incrementCount(userId, today, 1);
            }
        }
    }

    @Override
    @Transactional(readOnly = true)
    public int usedToday(Long userId) {
        return usageCounterRepository.findByUserIdAndUsageDay(userId, LocalDate.now(ZoneOffset.UTC))
                .map(UsageCounter::getQueryCount)
                .orElse(0);
    }

    private static PlanTier nextTier(PlanTier plan) {
        return plan == PlanTier.FREE ? PlanTier.PRO : PlanTier.BUSINESS;
    }
}
