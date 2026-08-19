package com.smagukji.backend.repository;

import com.smagukji.backend.domain.MemberWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MemberWeekRepository extends JpaRepository<MemberWeek, UUID> {

    List<MemberWeek> findAllByAllianceIdAndSnapshotDateOrderByMemberNameAsc(
            UUID allianceId, LocalDate snapshotDate);

    Optional<MemberWeek> findByAllianceIdAndSnapshotDateAndCid(
            UUID allianceId, LocalDate snapshotDate, String cid);

    /** 해당 동맹에 적재된 주차 목록(최신순). 화면의 주차 선택 드롭다운용. */
    @Query("select distinct m.snapshotDate from MemberWeek m "
            + "where m.allianceId = :allianceId order by m.snapshotDate desc")
    List<LocalDate> findSnapshotDates(@Param("allianceId") UUID allianceId);

    long countByAllianceIdAndSnapshotDate(UUID allianceId, LocalDate snapshotDate);

    /** cid 의 최근 기록. 주의 화면에서 이름을 함께 보여주기 위해 쓴다. */
    Optional<MemberWeek> findFirstByAllianceIdAndCidOrderBySnapshotDateDesc(
            UUID allianceId, String cid);
}
