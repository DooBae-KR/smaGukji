package com.smagukji.backend.repository;

import com.smagukji.backend.domain.Team;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TeamRepository extends JpaRepository<Team, UUID> {

    List<Team> findAllByOrderByCreatedAtDesc();

    /**
     * 분석에 필요한 연관을 한 번에 끌어온다. slots -> tactics 를 각각 join fetch 하면
     * MultipleBagFetchException 이 나므로 slots 만 fetch 하고 tactics 는 배치 로딩에 맡긴다.
     */
    @Query("select distinct t from Team t "
            + "left join fetch t.slots s "
            + "left join fetch s.general "
            + "where t.id = :id")
    Optional<Team> findByIdWithSlots(@Param("id") UUID id);
}
