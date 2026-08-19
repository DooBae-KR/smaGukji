package com.smagukji.backend.repository;

import com.smagukji.backend.domain.AppSession;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppSessionRepository extends JpaRepository<AppSession, UUID> {

    Optional<AppSession> findByTokenHash(String tokenHash);

    void deleteByAccountId(UUID accountId);

    @Modifying
    @Query("delete from AppSession s where s.expiresAt < :now")
    int deleteExpired(@Param("now") OffsetDateTime now);
}
