package com.mentalmadad.controller;

import com.mentalmadad.dto.request.CheckoutRequest;
import com.mentalmadad.dto.response.CheckoutResponse;
import com.mentalmadad.dto.response.PlanResponse;
import com.mentalmadad.dto.response.SubscriptionResponse;
import com.mentalmadad.security.CustomUserDetails;
import com.mentalmadad.service.SubscriptionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Subscription and billing endpoints.
 *
 * Security notes:
 * - /plans and /webhook are the only unauthenticated routes. The webhook is
 *   public because payment providers call it server-to-server; it is protected
 *   by signature verification inside the gateway, not by a session.
 * - A client can never grant itself a plan: /checkout only opens a hosted
 *   session, and entitlements change only when a verified provider event
 *   arrives (or, in the mock gateway, through /confirm, which is disabled the
 *   moment a real provider is configured).
 */
@RestController
@RequestMapping("/api/billing")
@Tag(name = "Billing", description = "Plans, checkout, subscription state and provider webhooks")
public class BillingController {

    private static final Logger log = LoggerFactory.getLogger(BillingController.class);

    private final SubscriptionService subscriptionService;

    public BillingController(SubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @GetMapping("/plans")
    @Operation(summary = "Pricing table (public)")
    public ResponseEntity<List<PlanResponse>> plans() {
        return ResponseEntity.ok(subscriptionService.plans());
    }

    @GetMapping("/subscription")
    @Operation(summary = "Current subscription for the caller",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<SubscriptionResponse> subscription(Authentication authentication) {
        return ResponseEntity.ok(subscriptionService.current(userId(authentication)));
    }

    @PostMapping("/checkout")
    @Operation(summary = "Start checkout for a paid plan",
            description = "Returns the hosted checkout URL to redirect the browser to.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<CheckoutResponse> checkout(Authentication authentication,
                                                     @Valid @RequestBody CheckoutRequest request) {
        CustomUserDetails principal = (CustomUserDetails) authentication.getPrincipal();
        return ResponseEntity.ok(
                subscriptionService.startCheckout(principal.getId(), principal.getEmail(), request));
    }

    @PostMapping("/confirm")
    @Operation(summary = "Confirm a simulated checkout (development gateway only)",
            description = "Activates the plan when app.billing.provider=mock. Rejected with 400 "
                    + "once a real payment provider is configured.",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<SubscriptionResponse> confirm(Authentication authentication,
                                                        @RequestParam String plan) {
        return ResponseEntity.ok(
                subscriptionService.confirmSimulatedCheckout(userId(authentication), plan));
    }

    @PostMapping("/cancel")
    @Operation(summary = "Cancel at the end of the paid period",
            security = @SecurityRequirement(name = "Bearer Authentication"))
    public ResponseEntity<SubscriptionResponse> cancel(Authentication authentication) {
        return ResponseEntity.ok(subscriptionService.cancel(userId(authentication)));
    }

    @PostMapping("/webhook")
    @Operation(summary = "Payment provider webhook (public, signature-verified)",
            description = "Consumes the raw request body. An unverifiable signature is rejected "
                    + "with 400 and nothing is applied.")
    public ResponseEntity<String> webhook(
            @RequestBody String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String signature) {
        try {
            subscriptionService.handleWebhook(payload, signature);
            return ResponseEntity.ok("ok");
        } catch (SecurityException ex) {
            // Never echo the reason back to the caller — an attacker probing the
            // endpoint learns nothing beyond "rejected".
            log.warn("Rejected billing webhook: {}", ex.getMessage());
            return ResponseEntity.badRequest().body("invalid signature");
        }
    }

    private static Long userId(Authentication authentication) {
        return ((CustomUserDetails) authentication.getPrincipal()).getId();
    }
}
