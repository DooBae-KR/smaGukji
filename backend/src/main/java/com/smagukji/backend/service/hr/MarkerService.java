package com.smagukji.backend.service.hr;

import com.smagukji.backend.domain.CautionNote;
import com.smagukji.backend.domain.MarkerType;
import com.smagukji.backend.domain.MemberMarker;
import com.smagukji.backend.domain.MemberWeek;
import com.smagukji.backend.repository.CautionNoteRepository;
import com.smagukji.backend.repository.MemberMarkerRepository;
import com.smagukji.backend.repository.MemberWeekRepository;
import com.smagukji.backend.web.ResourceNotFoundException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 마커 토글과 주의 사유 관리. */
@Service
public class MarkerService {

    private final MemberMarkerRepository markerRepository;
    private final CautionNoteRepository cautionRepository;
    private final MemberWeekRepository memberWeekRepository;

    public MarkerService(MemberMarkerRepository markerRepository,
            CautionNoteRepository cautionRepository, MemberWeekRepository memberWeekRepository) {
        this.markerRepository = markerRepository;
        this.cautionRepository = cautionRepository;
        this.memberWeekRepository = memberWeekRepository;
    }

    public record MarkerState(String cid, String markerType, boolean enabled, String label,
            String color, String updatedBy, OffsetDateTime updatedAt) {
    }

    /**
     * 주의 화면의 한 줄. cid 로 검색해서 찾는다.
     *
     * @param notes 최신순 사유 목록
     */
    public record CautionEntry(String cid, String memberName, boolean markerEnabled,
            long openCount, List<NoteView> notes) {
    }

    public record NoteView(UUID id, String reason, String createdBy, boolean resolved,
            OffsetDateTime createdAt, OffsetDateTime resolvedAt) {
    }

    // ---------------------------------------------------------------
    // 마커 토글
    // ---------------------------------------------------------------

    /**
     * 마커를 켜거나 끈다.
     *
     * <p>주의(CAUTION)를 <b>켤 때</b>는 사유가 반드시 있어야 한다. 왜 주의인지 남지 않으면
     * 나중에 아무도 설명할 수 없기 때문이다. 끌 때는 사유가 필요 없다.
     */
    @Transactional
    public MarkerState toggle(UUID allianceId, String cid, MarkerType type, boolean enabled,
            String reason, String actor) {

        Optional<MemberMarker> found =
                markerRepository.findByAllianceIdAndCidAndMarkerType(allianceId, cid, type);
        boolean wasEnabled = found.map(MemberMarker::isEnabled).orElse(false);

        if (type.requiresReason() && enabled && !wasEnabled
                && (reason == null || reason.isBlank())) {
            throw new IllegalArgumentException("주의를 켜려면 사유를 입력해야 합니다.");
        }

        MemberMarker marker = found
                .map(existing -> {
                    existing.toggle(enabled, actor);
                    return existing;
                })
                .orElseGet(() -> new MemberMarker(allianceId, cid, type, enabled, actor));

        MemberMarker saved = markerRepository.save(marker);

        if (type.requiresReason()) {
            if (enabled) {
                // 이미 켜져 있는데 또 켜면 사유가 중복으로 쌓인다. 새 사유가 있을 때만 남긴다.
                if (reason != null && !reason.isBlank()) {
                    cautionRepository.save(new CautionNote(allianceId, cid, reason.trim(), actor));
                }
            } else {
                // 주의를 끄면 미해제 사유도 함께 해제한다. 그러지 않으면 그리드에는
                // 주의 표시가 없는데 미해제 건수만 남는 유령 상태가 된다.
                resolveOpenNotes(allianceId, cid);
            }
        }

        return toState(saved);
    }

    /** 해당 cid 의 미해제 주의 사유를 전부 해제 처리한다. 기록 자체는 지우지 않는다. */
    private void resolveOpenNotes(UUID allianceId, String cid) {
        cautionRepository.findAllByAllianceIdAndCidOrderByCreatedAtDesc(allianceId, cid).stream()
                .filter(n -> !n.isResolved())
                .forEach(n -> {
                    n.resolve();
                    cautionRepository.save(n);
                });
    }

    @Transactional(readOnly = true)
    public List<MarkerState> markersOf(UUID allianceId, String cid) {
        return markerRepository.findAllByAllianceIdAndCid(allianceId, cid).stream()
                .map(MarkerService::toState)
                .toList();
    }

    // ---------------------------------------------------------------
    // 주의 사유
    // ---------------------------------------------------------------

    /** 마커와 별개로 사유만 추가한다. 이미 주의가 켜진 사람에게 사유를 덧붙일 때 쓴다. */
    @Transactional
    public NoteView addCaution(UUID allianceId, String cid, String reason, String actor) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("주의 사유를 입력해야 합니다.");
        }
        CautionNote note = cautionRepository.save(
                new CautionNote(allianceId, cid, reason.trim(), actor));

        // 사유가 생겼는데 마커가 꺼져 있으면 화면과 데이터가 어긋난다. 함께 켠다.
        markerRepository.findByAllianceIdAndCidAndMarkerType(allianceId, cid, MarkerType.CAUTION)
                .ifPresentOrElse(
                        m -> {
                            m.toggle(true, actor);
                            markerRepository.save(m);
                        },
                        () -> markerRepository.save(
                                new MemberMarker(allianceId, cid, MarkerType.CAUTION, true, actor)));

        return toView(note);
    }

    @Transactional
    public void resolveCaution(UUID allianceId, UUID noteId) {
        CautionNote note = cautionRepository.findById(noteId)
                .filter(n -> n.getAllianceId().equals(allianceId))
                .orElseThrow(() -> new ResourceNotFoundException("주의 기록을 찾을 수 없습니다: " + noteId));
        note.resolve();
        cautionRepository.save(note);

        // 마지막 미해제 건이 사라졌으면 마커도 함께 끈다.
        // 남겨두면 "주의 켜짐인데 사유는 하나도 안 남은" 설명 불가 상태가 된다.
        long remaining = cautionRepository
                .countByAllianceIdAndCidAndResolvedFalse(allianceId, note.getCid());
        if (remaining == 0) {
            markerRepository
                    .findByAllianceIdAndCidAndMarkerType(allianceId, note.getCid(), MarkerType.CAUTION)
                    .filter(MemberMarker::isEnabled)
                    .ifPresent(m -> {
                        m.toggle(false, "system:last-note-resolved");
                        markerRepository.save(m);
                    });
        }
    }

    /**
     * 주의 사유를 <b>완전히 삭제</b>한다.
     *
     * <p>«해제»는 기록을 남기고 상태만 바꾸지만, 이건 되돌릴 수 없다. 잘못 입력한 사유를
     * 치울 때 쓴다. 마지막 사유가 사라지면 마커도 함께 끈다.
     */
    @Transactional
    public void deleteCaution(UUID allianceId, UUID noteId) {
        CautionNote note = cautionRepository.findById(noteId)
                .filter(n -> n.getAllianceId().equals(allianceId))
                .orElseThrow(() -> new ResourceNotFoundException("주의 기록을 찾을 수 없습니다: " + noteId));

        String cid = note.getCid();
        cautionRepository.delete(note);
        cautionRepository.flush();

        // 사유가 하나도 남지 않으면 «주의 켜짐인데 근거는 없음» 상태가 되므로 마커를 끈다.
        boolean anyLeft = !cautionRepository
                .findAllByAllianceIdAndCidOrderByCreatedAtDesc(allianceId, cid).isEmpty();
        if (!anyLeft) {
            markerRepository
                    .findByAllianceIdAndCidAndMarkerType(allianceId, cid, MarkerType.CAUTION)
                    .filter(MemberMarker::isEnabled)
                    .ifPresent(m -> {
                        m.toggle(false, "system:all-notes-deleted");
                        markerRepository.save(m);
                    });
        }
    }

    /**
     * 주의 화면 목록. {@code query} 가 있으면 cid 또는 멤버명 부분일치로 거른다.
     *
     * @param onlyOpen true 면 미해제 건이 있는 사람만
     */
    @Transactional(readOnly = true)
    public List<CautionEntry> cautionBoard(UUID allianceId, String query, boolean onlyOpen) {
        List<CautionNote> notes = cautionRepository.findAllByAllianceIdOrderByCreatedAtDesc(allianceId);

        Map<String, List<CautionNote>> byCid = new LinkedHashMap<>();
        for (CautionNote note : notes) {
            byCid.computeIfAbsent(note.getCid(), k -> new ArrayList<>()).add(note);
        }

        Map<String, Boolean> markerEnabled = new LinkedHashMap<>();
        markerRepository
                .findAllByAllianceIdAndMarkerTypeAndEnabledTrue(allianceId, MarkerType.CAUTION)
                .forEach(m -> markerEnabled.put(m.getCid(), true));

        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);

        List<CautionEntry> entries = new ArrayList<>();
        for (Map.Entry<String, List<CautionNote>> e : byCid.entrySet()) {
            String cid = e.getKey();
            String memberName = memberWeekRepository
                    .findFirstByAllianceIdAndCidOrderBySnapshotDateDesc(allianceId, cid)
                    .map(MemberWeek::getMemberName)
                    .orElse("(시트에 없음)");

            long openCount = e.getValue().stream().filter(n -> !n.isResolved()).count();
            if (onlyOpen && openCount == 0) {
                continue;
            }
            if (!needle.isEmpty()
                    && !cid.toLowerCase(Locale.ROOT).contains(needle)
                    && !memberName.toLowerCase(Locale.ROOT).contains(needle)) {
                continue;
            }

            entries.add(new CautionEntry(cid, memberName,
                    markerEnabled.getOrDefault(cid, false), openCount,
                    e.getValue().stream().map(MarkerService::toView).toList()));
        }

        // 미해제가 많은 사람부터
        entries.sort(Comparator.comparingLong(CautionEntry::openCount).reversed()
                .thenComparing(CautionEntry::memberName));
        return entries;
    }

    @Transactional(readOnly = true)
    public Optional<CautionEntry> cautionOf(UUID allianceId, String cid) {
        return cautionBoard(allianceId, cid, false).stream()
                .filter(e -> e.cid().equals(cid))
                .findFirst();
    }

    // ---------------------------------------------------------------

    private static MarkerState toState(MemberMarker m) {
        return new MarkerState(m.getCid(), m.getMarkerType().name(), m.isEnabled(),
                m.getMarkerType().label(), m.getMarkerType().color(),
                m.getUpdatedBy(), m.getUpdatedAt());
    }

    private static NoteView toView(CautionNote n) {
        return new NoteView(n.getId(), n.getReason(), n.getCreatedBy(), n.isResolved(),
                n.getCreatedAt(), n.getResolvedAt());
    }
}
