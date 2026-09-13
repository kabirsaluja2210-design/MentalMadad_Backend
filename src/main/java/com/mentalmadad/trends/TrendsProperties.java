package com.mentalmadad.trends;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Configuration for the trend engine (prefix {@code app.trends}).
 * Every value has a working default so the product runs with no configuration.
 */
@Component
@ConfigurationProperties(prefix = "app.trends")
public class TrendsProperties {

    /**
     * Ordered provider preference, e.g. "wikipedia-pageviews,synthetic".
     * The first available provider that returns data wins.
     */
    private String providers = "wikipedia-pageviews,synthetic";

    /** Seconds a normalised series stays in the in-process cache. */
    private int cacheTtlSeconds = 900;

    /** Maximum number of series held in the in-process cache. */
    private int cacheMaxEntries = 2_000;

    /** Upstream HTTP timeout in milliseconds (per request). */
    private int httpTimeoutMs = 4_000;

    /**
     * Contact string sent as the User-Agent to Wikimedia, which requires one.
     * Override per deployment with a real contact address.
     */
    private String userAgent = "TrendPulse/1.0 (https://mentalmadad.com; contact@mentalmadad.com)";

    /** Whether the nightly refresh job runs in this instance. */
    private boolean refreshEnabled = true;

    /** Cron for the nightly refresh (default: 03:15 UTC, after upstream dailies land). */
    private String refreshCron = "0 15 3 * * *";

    /** Days of history the refresh job keeps warm per tracked term. */
    private int refreshWindowDays = 120;

    public String getProviders() { return providers; }
    public void setProviders(String providers) { this.providers = providers; }

    public int getCacheTtlSeconds() { return cacheTtlSeconds; }
    public void setCacheTtlSeconds(int cacheTtlSeconds) { this.cacheTtlSeconds = cacheTtlSeconds; }

    public int getCacheMaxEntries() { return cacheMaxEntries; }
    public void setCacheMaxEntries(int cacheMaxEntries) { this.cacheMaxEntries = cacheMaxEntries; }

    public int getHttpTimeoutMs() { return httpTimeoutMs; }
    public void setHttpTimeoutMs(int httpTimeoutMs) { this.httpTimeoutMs = httpTimeoutMs; }

    public String getUserAgent() { return userAgent; }
    public void setUserAgent(String userAgent) { this.userAgent = userAgent; }

    public boolean isRefreshEnabled() { return refreshEnabled; }
    public void setRefreshEnabled(boolean refreshEnabled) { this.refreshEnabled = refreshEnabled; }

    public String getRefreshCron() { return refreshCron; }
    public void setRefreshCron(String refreshCron) { this.refreshCron = refreshCron; }

    public int getRefreshWindowDays() { return refreshWindowDays; }
    public void setRefreshWindowDays(int refreshWindowDays) { this.refreshWindowDays = refreshWindowDays; }
}
