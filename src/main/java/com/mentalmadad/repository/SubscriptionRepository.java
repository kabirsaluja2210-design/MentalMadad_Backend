package com.mentalmadad.repository;

import com.mentalmadad.entity.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    Optional<Subscription> findByUserId(Long userId);

    Optional<Subscription> findByProviderSubscriptionId(String providerSubscriptionId);

    Optional<Subscription> findByProviderCustomerId(String providerCustomerId);
}
