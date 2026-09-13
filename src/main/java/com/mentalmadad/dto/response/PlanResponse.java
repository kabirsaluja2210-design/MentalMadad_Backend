package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** A purchasable tier, as shown on the pricing page. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A subscription tier and its entitlements")
public class PlanResponse {

    @Schema(example = "PRO", allowableValues = {"FREE", "PRO", "BUSINESS"})
    private String id;

    @Schema(example = "Pro")
    private String name;

    @Schema(description = "Monthly price in the smallest currency unit", example = "1900")
    private int priceMinorUnits;

    @Schema(description = "ISO currency of the price", example = "usd")
    private String currency;

    @Schema(description = "Queries allowed per day", example = "1000")
    private int dailyQueryLimit;

    @Schema(description = "Terms that can be compared in one chart", example = "5")
    private int maxCompareTerms;

    @Schema(description = "Days of history available", example = "1825")
    private int maxHistoryDays;

    @Schema(description = "Watchlist capacity", example = "50")
    private int maxWatchlistTerms;

    private boolean csvExport;

    private boolean alerts;

    private boolean apiAccess;

    @Schema(description = "Feature bullets for the pricing card")
    private List<String> features;

    @Schema(description = "True for the tier the pricing page should highlight")
    private boolean recommended;
}
