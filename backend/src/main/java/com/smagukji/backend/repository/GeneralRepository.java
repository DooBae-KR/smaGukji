package com.smagukji.backend.repository;

import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.General;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GeneralRepository extends JpaRepository<General, UUID> {

    Optional<General> findByName(String name);

    /**
     * 고유전법까지 함께 가져온다.
     *
     * <p>signatureTactic 은 LAZY 라 컨트롤러에서 DTO 로 옮길 때 세션이 없으면
     * LazyInitializationException 이 난다. 고유전법이 전부 NULL 이던 시절에는
     * 드러나지 않았지만, 값이 채워지자 목록 조회가 통째로 500 이 됐다.
     */
    @Query("select g from General g left join fetch g.signatureTactic order by g.name asc")
    List<General> findAllWithTactic();

    @Query("select g from General g left join fetch g.signatureTactic "
            + "where g.faction = :faction order by g.name asc")
    List<General> findAllByFactionWithTactic(@Param("faction") Faction faction);

    @Query("select g from General g left join fetch g.signatureTactic where g.id = :id")
    Optional<General> findByIdWithTactic(@Param("id") UUID id);

    long countByFaction(Faction faction);

    long countByUnitTypeIsNull();
}
