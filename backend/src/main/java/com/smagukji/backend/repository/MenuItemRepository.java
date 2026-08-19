package com.smagukji.backend.repository;

import com.smagukji.backend.domain.MenuItem;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MenuItemRepository extends JpaRepository<MenuItem, UUID> {

    List<MenuItem> findAllByOrderByPositionAsc();

    Optional<MenuItem> findByCode(String code);
}
