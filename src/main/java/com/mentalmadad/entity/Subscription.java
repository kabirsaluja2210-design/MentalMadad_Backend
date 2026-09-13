package com.mentalmadad.entity;

import com.mentalmadad.entity.enums.PlanTier;
import com.mentalmadad.entity.enums.SubscriptionStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A user's TrendPulse subscription.
 *
 * Design Notes:
 * - One row per user (OneToOne, unique user_id). Users without a row are
 *   treated as {@link PlanTier#FREE}; the service creates the row lazily on
 *   first access so there is no migration step for existing accounts.
 * - providerCustomerId / providerSubscriptionId are opaque ids owned by the
 *   billing gateway (Stripe ids in production, mock ids in dev). Keeping them
 *   as plain strings is what lets BillingGateway stay swappable.
 * - No card data is ever stored here — the payment provider hosts checkout.
 */
@Entity
@Table(name = "subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PlanTier plan = PlanTier.FREE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private SubscriptionStatus status = SubscriptionStatus.ACTIVE;

    /** End of the paid period; access is granted until this instant. Null for FREE. */
    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @Column(name = "cancel_at_period_end", nullable = false)
    @Builder.Default
    private boolean cancelAtPeriodEnd = false;

    @Column(name = "provider_customer_id", length = 255)
    private String providerCustomerId;

    @Column(name = "provider_subscription_id", length = 255)
    private String providerSubscriptionId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * The tier the account may actually use right now: a lapsed, canceled or
     * past-due subscription silently degrades to FREE rather than 403-ing the
     * user out of the product.
     */
    public PlanTier effectivePlan() {
        if (plan == null || !plan.isPaid()) {
            return PlanTier.FREE;
        }
        if (status == null || !status.grantsAccess()) {
            return PlanTier.FREE;
        }
        if (currentPeriodEnd != null && currentPeriodEnd.isBefore(LocalDateTime.now())) {
            return PlanTier.FREE;
        }
        return plan;
    }
}
