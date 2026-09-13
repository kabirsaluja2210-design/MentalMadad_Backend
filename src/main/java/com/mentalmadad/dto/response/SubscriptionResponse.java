package com.mentalmadad.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** The caller's current subscription state. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Current subscription for the authenticated user")
public class SubscriptionResponse {

    @Schema(description = "Tier the account is billed for", example = "PRO")
    private String plan;

    @Schema(description = "Tier the account may actually use right now — degrades to FREE when "
            + "a paid subscription lapses", example = "PRO")
    private String effectivePlan;

    @Schema(example = "ACTIVE", allowableValues = {"ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE"})
    private String status;

    @Schema(description = "End of the paid period; access is granted until then")
    private LocalDateTime currentPeriodEnd;

    @Schema(description = "True when the subscription will not renew")
    private boolean cancelAtPeriodEnd;

    @Schema(description = "Billing gateway backing this subscription", example = "stripe")
    private String provider;
}
