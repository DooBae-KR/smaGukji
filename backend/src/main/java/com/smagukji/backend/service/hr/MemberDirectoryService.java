package com.smagukji.backend.service.hr;

import com.smagukji.backend.domain.Alliance;
import com.smagukji.backend.domain.CautionNote;
import com.smagukji.backend.domain.MemberMarker;
import com.smagukji.backend.domain.MemberWeek;
import com.smagukji.backend.repository.AllianceRepository;
import com.smagukji.backend.repository.CautionNoteRepository;
import com.smagukji.backend.repository.MemberMarkerRepository;
import com.smagukji.backend.repository.MemberWeekRepository;
import com.smagukji.backend.web.ResourceNotFoundException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 인사팀 그리드 조회. 주차 스냅샷에 마커와 주의 이력을 붙여 준다. */
@Service
public class MemberDirectoryService {

    private final MemberWeekRepository memberWeekRepository;
    private final MemberMarkerRepository markerRepository;
    private final CautionNoteRepository cautionRepository;
    private final AllianceRepository allianceRepository;

    public MemberDirectoryService(MemberWeekRepository memberWeekRepository,
            MemberMarkerRepository markerRepository, CautionNoteRepository cautionRepository,
            AllianceRepository allianceRepository) {
        this.memberWeekRepository = memberWeekRepository;
        this.markerRepository = markerRepository;
        this.cautionRepository = cautionRepository;
        this.allianceRepository = allianceRepository;
    }

    public record DirectorySnapshot(UUID allianceId, String server, String allianceName,
            LocalDate snapshotDate, List<LocalDate> availableDates, List<MemberRow> rows) {
    }

    @Transactional(readOnly = true)
    public Alliance requireAlliance(String server, String name) {
        return allianceRepository.findByServerAndName(server, name)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "동맹을 찾을 수 없습니다: %s / %s".formatted(server, name)));
    }

    @Transactional(readOnly = true)
    public List<LocalDate> availableDates(UUID allianceId) {
        return memberWeekRepository.findSnapshotDates(allianceId);
    }

    /**
     * 지정 주차의 그리드를 만든다. {@code snapshotDate} 가 null 이면 가장 최근 주차를 쓴다.
     *
     * <p>마커와 주의는 주차가 아니라 cid 에 붙으므로, 어떤 주차를 보든 같은 값이 따라온다.
     */
    @Transactional(readOnly = true)
    public DirectorySnapshot loadGrid(String server, String allianceName, LocalDate snapshotDate) {
        Alliance alliance = requireAlliance(server, allianceName);
        UUID allianceId = alliance.getId();

        List<LocalDate> dates = memberWeekRepository.findSnapshotDates(allianceId);
        LocalDate target = snapshotDate != null ? snapshotDate
                : dates.isEmpty() ? null : dates.get(0);

        if (target == null) {
            return new DirectorySnapshot(allianceId, alliance.getServer(), alliance.getName(),
                    null, dates, List.of());
        }

        List<MemberWeek> weeks =
                memberWeekRepository.findAllByAllianceIdAndSnapshotDateOrderByMemberNameAsc(
                        allianceId, target);

        // cid → 켜진 마커 코드들
        Map<String, List<String>> markersByCid = new HashMap<>();
        for (MemberMarker marker : markerRepository.findAllByAllianceIdAndEnabledTrue(allianceId)) {
            markersByCid.computeIfAbsent(marker.getCid(), k -> new ArrayList<>())
                    .add(marker.getMarkerType().name());
        }

        // cid → 미해제 주의 건수 + 가장 최근 «미해제» 사유.
        // 해제된 사유를 최근 사유로 보여주면, 미해제 건수 옆에 엉뚱한 근거가 붙어
        // 운영자가 잘못된 이유를 읽게 된다. 그래서 미해제 건만 본다.
        Map<String, Long> openCounts = new HashMap<>();
        Map<String, String> latestOpenReason = new HashMap<>();
        for (CautionNote note : cautionRepository.findAllByAllianceIdOrderByCreatedAtDesc(allianceId)) {
            if (note.isResolved()) {
                continue;
            }
            openCounts.merge(note.getCid(), 1L, Long::sum);
            // 목록이 최신순이라 첫 등장이 가장 최근이다.
            latestOpenReason.putIfAbsent(note.getCid(), note.getReason());
        }

        List<MemberRow> rows = weeks.stream()
                .map(w -> new MemberRow(
                        w.getCid(),
                        w.getMemberName(),
                        w.getJob(),
                        w.getTeamGroup(),
                        w.getPosition(),
                        w.getProsperity(),
                        w.getWeeklyMerit(),
                        w.getWeeklyContribution(),
                        w.getGarrison(),
                        w.getWeeklySiegeCount(),
                        markersByCid.getOrDefault(w.getCid(), List.of()),
                        openCounts.getOrDefault(w.getCid(), 0L),
                        latestOpenReason.get(w.getCid())))
                .toList();

        return new DirectorySnapshot(allianceId, alliance.getServer(), alliance.getName(),
                target, dates, rows);
    }
}
