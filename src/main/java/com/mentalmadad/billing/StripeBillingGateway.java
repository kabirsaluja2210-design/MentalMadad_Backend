package com.mentalmadad.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.entity.enums.SubscriptionStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Stripe implementation of {@link BillingGateway}, spoken over Stripe's HTTP
 * API directly (form-encoded requests + Bearer secret key) rather than through
 * the SDK, to keep the dependency surface of this service unchanged.
 *
 * Security notes:
 * - Webhook payloads are authenticated with Stripe's {@code Stripe-Signature}
 *   scheme: HMAC-SHA256 over "{timestamp}.{raw body}" compared in constant
 *   time, with a five-minute replay window. An unverifiable payload raises
 *   {@link SecurityException} and is never applied.
 * - The secret key is read from configuration (env var in production) and is
 *   never logged, returned, or sent anywhere but api.stripe.com.
 */
@Component
@ConditionalOnProperty(name = "app.billing.provider", havingValue = "stripe")
public class StripeBillingGateway implements BillingGateway {

    public static final String NAME = "stripe";

    private static final Logger log = LoggerFactory.getLogger(StripeBillingGateway.class);
    private static final String API_BASE = "https://api.stripe.com/v1";
    private static final long SIGNATURE_TOLERANCE_SECONDS = 300L;

    private final BillingProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public StripeBillingGateway(BillingProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isConfigured() {
        return !properties.getStripe().getSecretKey().isBlank()
                && properties.priceIdFor(PlanTier.PRO) != null;
    }

    @Override
    public CheckoutSession createCheckout(Long userId, String email, PlanTier plan,
                                          String successUrl, String cancelUrl) {
        String priceId = properties.priceIdFor(plan);
        if (priceId == null) {
            throw new IllegalStateException("No Stripe price configured for plan " + plan);
        }
        Map<String, String> form = new LinkedHashMap<>();
        form.put("mode", "subscription");
        form.put("line_items[0][price]", priceId);
        form.put("line_items[0][quantity]", "1");
        form.put("success_url", successUrl + (successUrl.contains("?") ? "&" : "?")
                + "session_id={CHECKOUT_SESSION_ID}");
        form.put("cancel_url", cancelUrl);
        form.put("client_reference_id", String.valueOf(userId));
        form.put("customer_email", email);
        // Metadata is echoed back on the webhook, which is how the subscription
        // is matched to the account without trusting the redirect.
        form.put("metadata[userId]", String.valueOf(userId));
        form.put("metadata[plan]", plan.name());
        form.put("subscription_data[metadata][userId]", String.valueOf(userId));
        form.put("subscription_data[metadata][plan]", plan.name());

        JsonNode response = post("/checkout/sessions", form);
        String id = response.path("id").asText("");
        String url = response.path("url").asText("");
        if (url.isBlank()) {
            throw new IllegalStateException("Stripe did not return a checkout URL");
        }
        return new CheckoutSession(id, url, NAME);
    }

    @Override
    public Optional<BillingEvent> parseWebhook(String payload, String signatureHeader) {
        verifySignature(payload, signatureHeader);
        try {
            JsonNode root = objectMapper.readTree(payload);
            String type = root.path("type").asText("");
            JsonNode object = root.path("data").path("object");

            return switch (type) {
                case "checkout.session.completed" -> Optional.of(new BillingEvent(
                        BillingEvent.Type.ACTIVATED,
                        parseUserId(object),
                        planOf(object),
                        SubscriptionStatus.ACTIVE,
                        object.path("customer").asText(null),
                        object.path("subscription").asText(null),
                        null,
                        false));

                case "customer.subscription.updated" -> Optional.of(new BillingEvent(
                        BillingEvent.Type.UPDATED,
                        parseUserId(object),
                        planOf(object),
                        mapStatus(object.path("status").asText("")),
                        object.path("customer").asText(null),
                        object.path("id").asText(null),
                        epochToLocal(object.path("current_period_end").asLong(0)),
                        object.path("cancel_at_period_end").asBoolean(false)));

                case "customer.subscription.deleted" -> Optional.of(new BillingEvent(
                        BillingEvent.Type.CANCELED,
                        parseUserId(object),
                        PlanTier.FREE,
                        SubscriptionStatus.CANCELED,
                        object.path("customer").asText(null),
                        object.path("id").asText(null),
                        epochToLocal(object.path("current_period_end").asLong(0)),
                        false));

                case "invoice.payment_failed" -> Optional.of(new BillingEvent(
                        BillingEvent.Type.PAYMENT_FAILED,
                        parseUserId(object),
                        null,
                        SubscriptionStatus.PAST_DUE,
                        object.path("customer").asText(null),
                        object.path("subscription").asText(null),
                        null,
                        false));

                default -> {
                    log.debug("Ignoring Stripe event type {}", type);
                    yield Optional.empty();
                }
            };
        } catch (SecurityException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("Could not parse Stripe webhook: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public void cancelAtPeriodEnd(String providerSubscriptionId) {
        if (providerSubscriptionId == null || providerSubscriptionId.isBlank()) {
            return;
        }
        post("/subscriptions/" + providerSubscriptionId, Map.of("cancel_at_period_end", "true"));
    }

    /**
     * Stripe's signature scheme. Throws {@link SecurityException} unless a v1
     * signature over "{t}.{payload}" matches with the shared webhook secret and
     * the timestamp is inside the replay window.
     */
    void verifySignature(String payload, String signatureHeader) {
        String secret = properties.getStripe().getWebhookSecret();
        if (secret.isBlank()) {
            throw new SecurityException("Webhook secret is not configured");
        }
        if (signatureHeader == null || signatureHeader.isBlank()) {
            throw new SecurityException("Missing Stripe-Signature header");
        }
        String timestamp = null;
        String provided = null;
        for (String part : signatureHeader.split(",")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length != 2) {
                continue;
            }
            if ("t".equals(kv[0])) {
                timestamp = kv[1];
            } else if ("v1".equals(kv[0]) && provided == null) {
                provided = kv[1];
            }
        }
        if (timestamp == null || provided == null) {
            throw new SecurityException("Malformed Stripe-Signature header");
        }
        long age = Math.abs(Instant.now().getEpochSecond() - Long.parseLong(timestamp));
        if (age > SIGNATURE_TOLERANCE_SECONDS) {
            throw new SecurityException("Stripe signature timestamp outside tolerance");
        }
        String expected = hmacSha256Hex(secret, timestamp + "." + payload);
        if (!constantTimeEquals(expected, provided)) {
            throw new SecurityException("Stripe signature mismatch");
        }
    }

    private JsonNode post(String path, Map<String, String> form) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(API_BASE + path))
                    .header("Authorization", "Bearer " + properties.getStripe().getSecretKey())
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .timeout(Duration.ofSeconds(20))
                    .POST(HttpRequest.BodyPublishers.ofString(encodeForm(form)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode body = objectMapper.readTree(response.body());
            if (response.statusCode() >= 300) {
                String message = body.path("error").path("message").asText("Stripe request failed");
                throw new IllegalStateException("Stripe: " + message);
            }
            return body;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Stripe request interrupted", ex);
        } catch (IllegalStateException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Stripe request failed: " + ex.getMessage(), ex);
        }
    }

    private static String encodeForm(Map<String, String> form) {
        StringBuilder sb = new StringBuilder();
        form.forEach((k, v) -> {
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(URLEncoder.encode(k, StandardCharsets.UTF_8))
              .append('=')
              .append(URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8));
        });
        return sb.toString();
    }

    private static Long parseUserId(JsonNode object) {
        String raw = object.path("metadata").path("userId").asText("");
        if (raw.isBlank()) {
            raw = object.path("client_reference_id").asText("");
        }
        try {
            return raw.isBlank() ? null : Long.parseLong(raw);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static PlanTier planOf(JsonNode object) {
        String raw = object.path("metadata").path("plan").asText("");
        return raw.isBlank() ? null : PlanTier.fromNullable(raw);
    }

    private static SubscriptionStatus mapStatus(String stripeStatus) {
        return switch (stripeStatus) {
            case "active" -> SubscriptionStatus.ACTIVE;
            case "trialing" -> SubscriptionStatus.TRIALING;
            case "past_due", "unpaid" -> SubscriptionStatus.PAST_DUE;
            case "canceled", "incomplete_expired" -> SubscriptionStatus.CANCELED;
            default -> SubscriptionStatus.INCOMPLETE;
        };
    }

    private static LocalDateTime epochToLocal(long epochSeconds) {
        return epochSeconds <= 0 ? null
                : LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC);
    }

    private static String hmacSha256Hex(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xf, 16));
                hex.append(Character.forDigit(b & 0xf, 16));
            }
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("HMAC computation failed", ex);
        }
    }

    /** Length-independent, constant-time comparison of two hex strings. */
    private static boolean constantTimeEquals(String a, String b) {
        byte[] left = a.getBytes(StandardCharsets.UTF_8);
        byte[] right = b.getBytes(StandardCharsets.UTF_8);
        int result = left.length ^ right.length;
        for (int i = 0; i < Math.max(left.length, right.length); i++) {
            byte l = i < left.length ? left[i] : 0;
            byte r = i < right.length ? right[i] : 0;
            result |= l ^ r;
        }
        return result == 0;
    }
}
