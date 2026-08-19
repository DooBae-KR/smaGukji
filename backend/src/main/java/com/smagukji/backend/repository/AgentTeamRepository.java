package com.smagukji.backend.repository;

import com.smagukji.backend.domain.AgentTeam;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentTeamRepository extends JpaRepository<AgentTeam, UUID> {

    List<AgentTeam> findAllByOrderByPositionAsc();

    Optional<AgentTeam> findByCode(String code);
}
