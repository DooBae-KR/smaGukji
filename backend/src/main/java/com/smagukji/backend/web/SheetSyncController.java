package com.smagukji.backend.web;

import com.smagukji.backend.service.GeneralSheetSyncService;
import com.smagukji.backend.service.GeneralSheetSyncService.RosterResult;
import com.smagukji.backend.service.GeneralSheetSyncService.SyncResult;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 스프레드시트 → DB 동기화.
 *
 * <p>버튼 하나로 장수와 전법을 한 번에 불러오기 위한 엔드포인트다.
 * 두 시트를 순서대로 처리한다.
 * <ol>
 *   <li>마스터 목록(구분/이름) — 전법 이름을 맞춘다. 없는 전법은 만든다.</li>
 *   <li>무장 상세 — 장수의 진영·성향·병종·수치와 고유전법을 채운다.</li>
 * </ol>
 * 순서가 중요하다. 전법 이름이 먼저 있어야 장수의 고유전법 연결이 자연스럽다.
 */
@RestController
@RequestMapping("/api/sheets")
public class SheetSyncController {

    private final GeneralSheetSyncService syncService;

    public SheetSyncController(GeneralSheetSyncService syncService) {
        this.syncService = syncService;
    }

    /**
     * 통합 동기화 결과.
     *
     * @param warnings 사람이 확인해야 할 것들. 시트 오타나 명단 불일치가 여기 담긴다
     */
    public record CombinedResult(RosterResult roster, SyncResult general, List<String> warnings) {
    }

    @PostMapping("/sync")
    public CombinedResult sync() throws IOException, InterruptedException {
        RosterResult roster = syncService.syncRoster();
        SyncResult general = syncService.sync();

        List<String> warnings = new ArrayList<>();

        if (!roster.suspectedTypos().isEmpty()) {
            warnings.add("오타로 보여 만들지 않은 전법 이름: " + String.join(" / ", roster.suspectedTypos()));
        }
        if (!roster.missingGenerals().isEmpty()) {
            warnings.add("마스터 목록에는 있으나 DB 에 없는 장수 %d명: %s. 세력·코스트를 몰라 자동으로 만들지 않았습니다."
                    .formatted(roster.missingGenerals().size(),
                            String.join(", ", roster.missingGenerals())));
        }
        if (!roster.extraGenerals().isEmpty()) {
            warnings.add("DB 에만 있는 장수 %d명: %s"
                    .formatted(roster.extraGenerals().size(),
                            String.join(", ", roster.extraGenerals())));
        }
        if (!general.notFound().isEmpty()) {
            warnings.add("무장 시트에는 있으나 장수 명단에 없는 이름 %d개: %s"
                    .formatted(general.notFound().size(), String.join(", ", general.notFound())));
        }
        if (!general.skipped().isEmpty()) {
            warnings.add("분류 값을 알 수 없어 건너뛴 행: " + String.join(" / ", general.skipped()));
        }

        return new CombinedResult(roster, general, warnings);
    }
}
