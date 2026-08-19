package com.smagukji.backend.repository;

import com.smagukji.backend.domain.Alliance;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AllianceRepository extends JpaRepository<Alliance, UUID> {

    Optional<Alliance> findByServerAndName(String server, String name);

    List<Alliance> findAllByOrderByServerAscNameAsc();
}
