package com.smagukji.backend.repository;

import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.General;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GeneralRepository extends JpaRepository<General, UUID> {

    Optional<General> findByName(String name);

    List<General> findAllByOrderByNameAsc();

    List<General> findAllByFactionOrderByNameAsc(Faction faction);

    long countByFaction(Faction faction);

    long countByUnitTypeIsNull();
}
