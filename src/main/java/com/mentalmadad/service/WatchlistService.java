package com.mentalmadad.service;

import com.mentalmadad.dto.request.TrackTermRequest;
import com.mentalmadad.dto.response.TrackedTermResponse;
import com.mentalmadad.dto.response.TrendAlertResponse;

import java.util.List;

/**
 * Watchlists and the alerts generated from them.
 *
 * The watchlist is both a user feature and the system's cache-warming hint
 * list: whatever users track is what the nightly job keeps fresh.
 */
public interface WatchlistService {

    List<TrackedTermResponse> list(Long userId);

    /** Adds a term, enforcing the plan's watchlist capacity. */
    TrackedTermResponse add(Long userId, TrackTermRequest request);

    void remove(Long userId, Long trackedTermId);

    /** Most recent alerts for the user (paid plans generate them). */
    List<TrendAlertResponse> alerts(Long userId);

    TrendAlertResponse markAlertRead(Long userId, Long alertId);
}
