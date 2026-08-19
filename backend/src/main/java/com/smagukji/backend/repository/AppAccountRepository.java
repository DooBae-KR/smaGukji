package com.smagukji.backend.repository;

import com.smagukji.backend.domain.AccountRole;
import com.smagukji.backend.domain.AppAccount;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppAccountRepository extends JpaRepository<AppAccount, UUID> {

    Optional<AppAccount> findByLoginId(String loginId);

    Optional<AppAccount> findByLoginIdAndRole(String loginId, AccountRole role);

    List<AppAccount> findAllByAllianceIdOrderByLoginIdAsc(UUID allianceId);

    long countByRole(AccountRole role);
}
