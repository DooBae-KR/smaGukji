package com.smagukji.backend.repository;

import com.smagukji.backend.domain.MemberWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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

    /**
     * 해당 주차를 통째로 지운다. 시트가 그 주차의 유일한 진실이므로 재업로드는 «교체»다.
     *
     * <p>행 단위로 조회해서 갱신하면 (1) 동시에 두 번 올릴 때 중복 키가 나고,
     * (2) 시트에서 빠진 탈퇴자 행이 남는다.
     */
    @Modifying
    @Query("delete from MemberWeek m where m.allianceId = :allianceId and m.snapshotDate = :date")
    int deleteByAllianceIdAndSnapshotDate(@Param("allianceId") UUID allianceId,
            @Param("date") LocalDate date);

    /** cid 의 최근 기록. 주의 화면에서 이름을 함께 보여주기 위해 쓴다. */
    Optional<MemberWeek> findFirstByAllianceIdAndCidOrderBySnapshotDateDesc(
            UUID allianceId, String cid);
}
