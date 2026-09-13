package com.mentalmadad.controller;

import com.mentalmadad.dto.response.TrendComparisonResponse;
import com.mentalmadad.dto.response.TrendSeriesResponse;
import com.mentalmadad.dto.response.TrendingTopicResponse;
import com.mentalmadad.dto.response.UsageResponse;
import com.mentalmadad.security.CustomUserDetails;
import com.mentalmadad.service.TrendService;
import com.mentalmadad.trends.TrendCatalog;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * TrendPulse query API.
 *
 * Design Notes:
 * - Two public endpoints (the trending board and completions) act as the
 *   product's shop window; everything that consumes quota requires a JWT.
 * - Quota, history depth and comparison width are enforced in the service, not
 *   here, so the same rules apply to any future caller.
 * - A 402 Payment Required response means "your plan does not include this" and
 *   carries the tier that does (see GlobalExceptionHandler).
 */
@RestController
@RequestMapping("/api/trends")
@Tag(name = "Trends", description = "Daily trend analysis: series, comparisons, trending board and export")
public class TrendController {

    private final TrendService trendService;

    public TrendController(TrendService trendService) {
        this.trendService = trendService;
    }

    @GetMapping("/series")
    @Operation(summary = "Daily interest series for one term",
            description = "Returns a dense daily series scaled 0-100 against the peak of the "
                    + "window, a 7-day smoothed overlay, headline insight metrics, and — on paid "
                    + "plans — a 14-day forecast. Counts as one query against the daily quota.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<TrendSeriesResponse> series(
            Authentication authentication,
            @RequestParam String term,
            @RequestParam(defaultValue = TrendCatalog.WORLDWIDE) String geo,
            @RequestParam(defaultValue = "90") int days) {
        return ResponseEntity.ok(trendService.series(userId(authentication), term, geo, days));
    }

    @GetMapping("/compare")
    @Operation(summary = "Compare several terms on one scale",
            description = "All series are normalised against a single shared maximum so the lines "
                    + "are directly comparable, and every unordered pair gets a Pearson "
                    + "correlation. Costs one query per term.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<TrendComparisonResponse> compare(
            Authentication authentication,
            @RequestParam String terms,
            @RequestParam(defaultValue = TrendCatalog.WORLDWIDE) String geo,
            @RequestParam(defaultValue = "90") int days) {
        return ResponseEntity.ok(trendService.compare(userId(authentication), terms, geo, days));
    }

    @GetMapping("/trending")
    @Operation(summary = "Trending now (public)",
            description = "Curated terms ranked by 7-day-over-7-day movement, with a sparkline "
                    + "for each row. Served from the pre-warmed board — no account required.")
    public ResponseEntity<List<TrendingTopicResponse>> trending(
            @RequestParam(defaultValue = TrendCatalog.WORLDWIDE) String geo,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "12") int limit) {
        return ResponseEntity.ok(trendService.trendingNow(geo, category, limit));
    }

    @GetMapping("/suggest")
    @Operation(summary = "Search-box completions (public)")
    public ResponseEntity<List<String>> suggest(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "8") int limit) {
        return ResponseEntity.ok(trendService.suggest(q, limit));
    }

    @GetMapping("/regions")
    @Operation(summary = "Supported regions (public)",
            description = "Region code to display label, in menu order.")
    public ResponseEntity<Map<String, String>> regions() {
        return ResponseEntity.ok(TrendCatalog.regions());
    }

    @GetMapping("/categories")
    @Operation(summary = "Curated categories for the trending board (public)")
    public ResponseEntity<Map<String, List<String>>> categories() {
        return ResponseEntity.ok(TrendCatalog.categories());
    }

    @GetMapping("/usage")
    @Operation(summary = "Quota usage and live service counters",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<UsageResponse> usage(Authentication authentication) {
        return ResponseEntity.ok(trendService.usage(userId(authentication)));
    }

    @GetMapping(value = "/export", produces = "text/csv")
    @Operation(summary = "Export series as CSV (Pro and Business)",
            description = "Returns date,term,geo,index,raw_value rows for every requested term. "
                    + "Responds 402 with the required plan when the caller's tier does not "
                    + "include export.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<String> export(
            Authentication authentication,
            @RequestParam String terms,
            @RequestParam(defaultValue = TrendCatalog.WORLDWIDE) String geo,
            @RequestParam(defaultValue = "90") int days) {
        String csv = trendService.exportCsv(userId(authentication), terms, geo, days);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"trendpulse-export.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv);
    }

    private static Long userId(Authentication authentication) {
        return ((CustomUserDetails) authentication.getPrincipal()).getId();
    }
}
