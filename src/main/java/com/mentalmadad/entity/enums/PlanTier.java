package com.mentalmadad.entity.enums;

/**
 * Subscription tiers for TrendPulse, the daily trend-analysis product.
 *
 * Design Notes:
 * - GoF Strategy (enum-as-strategy): every quota/entitlement decision in the
 *   application reads the limits off this enum, so adding a tier or changing a
 *   limit is a one-line change here — services and controllers never branch on
 *   the tier name.
 * - Prices are expressed in the smallest currency unit (cents/paise) to avoid
 *   floating-point money; the currency itself is configured per deployment via
 *   {@code app.billing.currency}.
 */
public enum PlanTier {

    FREE("Free", 0,
            25, 2, 90, 3,
            false, false, false),

    PRO("Pro", 1900,
            1_000, 5, 1_825, 50,
            true, true, false),

    BUSINESS("Business", 9900,
            20_000, 10, 3_650, 500,
            true, true, true);

    private final String displayName;
    private final int monthlyPriceMinorUnits;
    private final int dailyQueryLimit;
    private final int maxCompareTerms;
    private final int maxHistoryDays;
    private final int maxWatchlistTerms;
    private final boolean csvExport;
    private final boolean alerts;
    private final boolean apiAccess;

    PlanTier(String displayName, int monthlyPriceMinorUnits, int dailyQueryLimit,
             int maxCompareTerms, int maxHistoryDays, int maxWatchlistTerms,
             boolean csvExport, boolean alerts, boolean apiAccess) {
        this.displayName = displayName;
        this.monthlyPriceMinorUnits = monthlyPriceMinorUnits;
        this.dailyQueryLimit = dailyQueryLimit;
        this.maxCompareTerms = maxCompareTerms;
        this.maxHistoryDays = maxHistoryDays;
        this.maxWatchlistTerms = maxWatchlistTerms;
        this.csvExport = csvExport;
        this.alerts = alerts;
        this.apiAccess = apiAccess;
    }

    public String getDisplayName() { return displayName; }
    public int getMonthlyPriceMinorUnits() { return monthlyPriceMinorUnits; }
    public int getDailyQueryLimit() { return dailyQueryLimit; }
    public int getMaxCompareTerms() { return maxCompareTerms; }
    public int getMaxHistoryDays() { return maxHistoryDays; }
    public int getMaxWatchlistTerms() { return maxWatchlistTerms; }
    public boolean isCsvExport() { return csvExport; }
    public boolean isAlerts() { return alerts; }
    public boolean isApiAccess() { return apiAccess; }

    /** True when this tier is at least as capable as {@code other}. */
    public boolean atLeast(PlanTier other) {
        return this.ordinal() >= other.ordinal();
    }

    /** Paid tiers are the ones that go through the billing gateway. */
    public boolean isPaid() {
        return monthlyPriceMinorUnits > 0;
    }

    /** Case-insensitive parse that never throws — unknown values fall back to FREE. */
    public static PlanTier fromNullable(String raw) {
        if (raw == null || raw.isBlank()) {
            return FREE;
        }
        for (PlanTier tier : values()) {
            if (tier.name().equalsIgnoreCase(raw.trim())) {
                return tier;
            }
        }
        return FREE;
    }
}
