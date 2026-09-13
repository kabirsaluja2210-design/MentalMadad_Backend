package com.mentalmadad.repository;

import com.mentalmadad.entity.TrendSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TrendSnapshotRepository extends JpaRepository<TrendSnapshot, Long> {

    List<TrendSnapshot> findByTermKeyAndGeoAndObservedOnBetweenOrderByObservedOnAsc(
            String termKey, String geo, LocalDate from, LocalDate to);

    Optional<TrendSnapshot> findByTermKeyAndGeoAndObservedOn(
            String termKey, String geo, LocalDate observedOn);

    @Query("select max(s.observedOn) from TrendSnapshot s where s.termKey = :termKey and s.geo = :geo")
    Optional<LocalDate> findLatestObservedOn(@Param("termKey") String termKey,
                                             @Param("geo") String geo);

    @Query("select count(distinct s.termKey) from TrendSnapshot s")
    long countDistinctTerms();

    /** Distinct (termKey, displayTerm, geo) triples — the set the refresh job warms. */
    @Query("select distinct s.termKey, s.displayTerm, s.geo from TrendSnapshot s")
    List<Object[]> findDistinctTerms();
}
