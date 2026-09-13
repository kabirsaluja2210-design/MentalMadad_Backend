package com.mentalmadad.billing;

/**
 * Hosted-checkout handle returned by a {@link BillingGateway}.
 *
 * @param sessionId provider-side id, echoed back on the success redirect
 * @param url       the page the browser must be sent to
 * @param provider  gateway that created it ("stripe", "mock")
 */
public record CheckoutSession(String sessionId, String url, String provider) {
}
