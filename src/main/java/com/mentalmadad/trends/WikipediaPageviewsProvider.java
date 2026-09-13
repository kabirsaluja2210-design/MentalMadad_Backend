package com.mentalmadad.trends;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Default live data source: the Wikimedia Pageviews API.
 *
 * Why this source: it is a public, documented, free API that publishes DAILY
 * per-article numbers for every language edition, which is exactly the
 * granularity and freshness this product sells. There is no official public
 * Google Trends API, and scraping the private one is neither permitted nor
 * dependable, so TrendPulse reads a source that does publish one and
 * normalises it into the same relative 0-100 index.
 *
 * Design Notes:
 * - Two calls per cold term: resolve the search term to an article title, then
 *   fetch that article's daily series. Title resolution is memoised in-process
 *   because it changes far more slowly than the pageview data.
 * - Region maps to a Wikipedia language project (see TrendCatalog), giving a
 *   real per-region series rather than a cosmetic filter.
 * - Never throws for an upstream failure: returns an empty list so
 *   TrendProviderRegistry can fall through to the next provider.
 */
@Component
public class WikipediaPageviewsProvider implements TrendDataProvider {

    public static final String NAME = "wikipedia-pageviews";

    private static final Logger log = LoggerFactory.getLogger(WikipediaPageviewsProvider.class);
    private static final DateTimeFormatter API_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final int MAX_TITLE_CACHE = 5_000;

    private final TrendsProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    /** (project|termKey) -> resolved article title, or "" when the term has no article. */
    private final Map<String, String> titleCache = new ConcurrentHashMap<>();

    /** Flipped off after a hard upstream failure so we stop paying the timeout on every request. */
    private final AtomicBoolean reachable = new AtomicBoolean(true);
    private volatile long unreachableUntilEpochMs = 0L;

    public WikipediaPageviewsProvider(TrendsProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(properties.getHttpTimeoutMs()))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isAvailable() {
        if (reachable.get()) {
            return true;
        }
        // Circuit breaker: retry the upstream once the cool-off has elapsed.
        if (System.currentTimeMillis() >= unreachableUntilEpochMs) {
            reachable.set(true);
            return true;
        }
        return false;
    }

    @Override
    public List<DailyPoint> fetchDaily(String term, String geo, LocalDate from, LocalDate to) {
        String project = TrendCatalog.wikipediaProject(TermKeys.geo(geo));
        String title = resolveTitle(project, term);
        if (title.isEmpty()) {
            return List.of();
        }
        String url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
                + project + "/all-access/user/" + encodePathSegment(title)
                + "/daily/" + from.format(API_DATE) + "/" + to.format(API_DATE);

        String body = get(url);
        if (body == null) {
            return List.of();
        }
        try {
            JsonNode items = objectMapper.readTree(body).path("items");
            List<DailyPoint> points = new ArrayList<>();
            for (JsonNode item : items) {
                String timestamp = item.path("timestamp").asText("");
                if (timestamp.length() < 8) {
                    continue;
                }
                LocalDate date = LocalDate.parse(timestamp.substring(0, 8), API_DATE);
                points.add(new DailyPoint(date, item.path("views").asDouble(0d)));
            }
            return points;
        } catch (Exception ex) {
            log.debug("Could not parse pageviews payload for '{}' ({}): {}", term, project, ex.getMessage());
            return List.of();
        }
    }

    @Override
    public List<String> suggest(String prefix, int limit) {
        String query = TermKeys.display(prefix);
        if (query.isEmpty()) {
            return List.of();
        }
        String url = "https://en.wikipedia.org/w/rest.php/v1/search/title?q="
                + URLEncoder.encode(query, StandardCharsets.UTF_8) + "&limit=" + Math.max(1, Math.min(limit, 20));
        String body = get(url);
        if (body == null) {
            return List.of();
        }
        try {
            JsonNode pages = objectMapper.readTree(body).path("pages");
            List<String> titles = new ArrayList<>();
            for (JsonNode page : pages) {
                String title = page.path("title").asText("");
                if (!title.isBlank()) {
                    titles.add(title);
                }
            }
            return titles;
        } catch (Exception ex) {
            log.debug("Could not parse suggest payload for '{}': {}", prefix, ex.getMessage());
            return List.of();
        }
    }

    /**
     * Maps a free-text term to the article whose pageviews represent it.
     * Memoised — including negative results, so an unresolvable term costs one
     * upstream call per process, not one per request.
     */
    private String resolveTitle(String project, String term) {
        String cacheKey = project + "|" + TermKeys.key(term);
        String cached = titleCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        String language = project.contains(".") ? project.substring(0, project.indexOf('.')) : "en";
        String url = "https://" + language + ".wikipedia.org/w/rest.php/v1/search/title?q="
                + URLEncoder.encode(TermKeys.display(term), StandardCharsets.UTF_8) + "&limit=1";

        String resolved = "";
        String body = get(url);
        if (body != null) {
            try {
                JsonNode pages = objectMapper.readTree(body).path("pages");
                if (pages.isArray() && !pages.isEmpty()) {
                    resolved = pages.get(0).path("key").asText(pages.get(0).path("title").asText(""));
                }
            } catch (Exception ex) {
                log.debug("Could not resolve title for '{}': {}", term, ex.getMessage());
            }
        }
        if (titleCache.size() < MAX_TITLE_CACHE) {
            titleCache.put(cacheKey, resolved);
        }
        return resolved;
    }

    /** GET returning the body, or null on any non-200 / transport failure. */
    private String get(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", properties.getUserAgent())
                    .header("Accept", "application/json")
                    .timeout(Duration.ofMillis(properties.getHttpTimeoutMs()))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                return response.body();
            }
            // 404 simply means "no data for this article/window" — not an outage.
            if (response.statusCode() != 404) {
                log.debug("Wikimedia responded {} for {}", response.statusCode(), url);
            }
            return null;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception ex) {
            log.info("Wikimedia unreachable ({}), falling back to the next provider for 60s", ex.getMessage());
            reachable.set(false);
            unreachableUntilEpochMs = System.currentTimeMillis() + 60_000L;
            return null;
        }
    }

    /** Percent-encodes a title for a path segment (spaces become underscores first). */
    private static String encodePathSegment(String title) {
        return URLEncoder.encode(title.replace(' ', '_'), StandardCharsets.UTF_8)
                .replace("+", "%20");
    }
}
