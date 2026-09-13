package com.mentalmadad.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables Spring's scheduler, which drives the nightly trend refresh.
 *
 * The job itself is additionally gated by {@code app.trends.refresh-enabled},
 * so a deployment running several replicas can leave scheduling on while only
 * one instance actually performs the refresh.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
