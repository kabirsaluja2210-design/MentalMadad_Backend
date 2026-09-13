package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Where to send the browser to complete a purchase. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Hosted checkout handle")
public class CheckoutResponse {

    @Schema(description = "Provider-side checkout session id", example = "cs_test_a1b2c3")
    private String sessionId;

    @Schema(description = "URL the browser must be redirected to", example = "https://checkout.stripe.com/c/pay/cs_test_a1b2c3")
    private String checkoutUrl;

    @Schema(description = "Gateway that created the session", example = "stripe")
    private String provider;

    @Schema(description = "Tier being purchased", example = "PRO")
    private String plan;

    @Schema(description = "True when this is the local simulated gateway (no real payment)")
    private boolean simulated;
}
