package com.mentalmadad.controller;

import com.mentalmadad.dto.request.TrackTermRequest;
import com.mentalmadad.dto.response.TrackedTermResponse;
import com.mentalmadad.dto.response.TrendAlertResponse;
import com.mentalmadad.security.CustomUserDetails;
import com.mentalmadad.service.WatchlistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Watchlist and alert endpoints. Every operation is scoped to the calling
 * account — ids are always looked up together with the user id, so one user can
 * never read or delete another's rows.
 */
@RestController
@RequestMapping("/api/trends")
@Tag(name = "Watchlist", description = "Tracked terms and the alerts raised on them")
public class WatchlistController {

    private final WatchlistService watchlistService;

    public WatchlistController(WatchlistService watchlistService) {
        this.watchlistService = watchlistService;
    }

    @GetMapping("/watchlist")
    @Operation(summary = "List tracked terms",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<List<TrackedTermResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(watchlistService.list(userId(authentication)));
    }

    @PostMapping("/watchlist")
    @Operation(summary = "Track a term",
            description = "Idempotent: tracking a term already on the list returns the existing "
                    + "entry. Responds 402 when the plan's watchlist capacity is reached.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<TrackedTermResponse> add(Authentication authentication,
                                                   @Valid @RequestBody TrackTermRequest request) {
        return ResponseEntity.ok(watchlistService.add(userId(authentication), request));
    }

    @DeleteMapping("/watchlist/{id}")
    @Operation(summary = "Stop tracking a term",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<Void> remove(Authentication authentication, @PathVariable Long id) {
        watchlistService.remove(userId(authentication), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/alerts")
    @Operation(summary = "Recent alerts on tracked terms",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<List<TrendAlertResponse>> alerts(Authentication authentication) {
        return ResponseEntity.ok(watchlistService.alerts(userId(authentication)));
    }

    @PostMapping("/alerts/{id}/read")
    @Operation(summary = "Mark an alert as read",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<TrendAlertResponse> markRead(Authentication authentication,
                                                       @PathVariable Long id) {
        return ResponseEntity.ok(watchlistService.markAlertRead(userId(authentication), id));
    }

    private static Long userId(Authentication authentication) {
        return ((CustomUserDetails) authentication.getPrincipal()).getId();
    }
}
