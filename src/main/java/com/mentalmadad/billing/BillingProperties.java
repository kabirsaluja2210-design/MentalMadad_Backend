package com.mentalmadad.billing;

import com.mentalmadad.entity.enums.PlanTier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Billing configuration (prefix {@code app.billing}).
 *
 * Out of the box the mock gateway is active so the whole subscribe flow can be
 * exercised locally with no Stripe account. Setting
 * {@code app.billing.provider=stripe} plus the four Stripe values switches the
 * same flow onto real payments without touching application code.
 */
@Component
@ConfigurationProperties(prefix = "app.billing")
public class BillingProperties {

    /** "mock" (default) or "stripe". */
    private String provider = "mock";

    /** ISO currency for displayed prices — must match the Stripe prices in use. */
    private String currency = "usd";

    /** Where the provider sends the customer after a successful checkout. */
    private String successUrl = "http://localhost:3000/billing/success";

    /** Where the provider sends the customer if they abandon checkout. */
    private String cancelUrl = "http://localhost:3000/pricing";

    private final Stripe stripe = new Stripe();

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getSuccessUrl() { return successUrl; }
    public void setSuccessUrl(String successUrl) { this.successUrl = successUrl; }

    public String getCancelUrl() { return cancelUrl; }
    public void setCancelUrl(String cancelUrl) { this.cancelUrl = cancelUrl; }

    public Stripe getStripe() { return stripe; }

    /** Stripe price id for a tier, or null when the tier is free/unconfigured. */
    public String priceIdFor(PlanTier plan) {
        return switch (plan) {
            case PRO -> emptyToNull(stripe.getPricePro());
            case BUSINESS -> emptyToNull(stripe.getPriceBusiness());
            case FREE -> null;
        };
    }

    private static String emptyToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }

    /** Stripe credentials. Never commit real values — inject them as env vars. */
    public static class Stripe {
        private String secretKey = "";
        private String webhookSecret = "";
        private String pricePro = "";
        private String priceBusiness = "";

        public String getSecretKey() { return secretKey; }
        public void setSecretKey(String secretKey) { this.secretKey = secretKey; }

        public String getWebhookSecret() { return webhookSecret; }
        public void setWebhookSecret(String webhookSecret) { this.webhookSecret = webhookSecret; }

        public String getPricePro() { return pricePro; }
        public void setPricePro(String pricePro) { this.pricePro = pricePro; }

        public String getPriceBusiness() { return priceBusiness; }
        public void setPriceBusiness(String priceBusiness) { this.priceBusiness = priceBusiness; }
    }
}
