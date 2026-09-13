package com.mentalmadad.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Request body for POST /api/billing/checkout. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Start a subscription checkout")
public class CheckoutRequest {

    @NotBlank(message = "Plan is required")
    @Schema(description = "Tier to purchase", example = "PRO", allowableValues = {"PRO", "BUSINESS"})
    private String plan;

    @Schema(description = "Override for the post-payment redirect; defaults to app.billing.success-url",
            example = "https://app.example.com/billing/success")
    private String successUrl;

    @Schema(description = "Override for the abandoned-checkout redirect; defaults to app.billing.cancel-url",
            example = "https://app.example.com/pricing")
    private String cancelUrl;
}
