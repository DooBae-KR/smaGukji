package com.smagukji.backend.repository;

import com.smagukji.backend.domain.Buff;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BuffRepository extends JpaRepository<Buff, UUID> {

    Optional<Buff> findByName(String name);
}
