package com.smagukji.backend.repository;

import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.TacticCategory;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TacticRepository extends JpaRepository<Tactic, UUID> {

    Optional<Tactic> findByName(String name);

    List<Tactic> findAllByOrderByNameAsc();

    List<Tactic> findAllByCategoryOrderByNameAsc(TacticCategory category);

    long countByCategoryIsNull();
}
