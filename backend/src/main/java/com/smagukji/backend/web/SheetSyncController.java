package com.smagukji.backend.web;

import com.smagukji.backend.service.GeneralSheetSyncService;
import com.smagukji.backend.service.GeneralSheetSyncService.RosterResult;
import com.smagukji.backend.service.GeneralSheetSyncService.SyncResult;
import com.smagukji.backend.service.TacticSheetSyncService;
import com.smagukji.backend.service.TacticSheetSyncService.SheetResult;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 스프레드시트 → DB 동기화.
 *
 * <p>버튼 하나로 네 개의 탭을 한 번에 읽는다. 순서가 중요하다.
 * <ol>
 *   <li>마스터 목록(구분/이름) — 이름을 맞춘다. 없는 전법은 만든다.</li>
 *   <li>전법 탭 — 배워서 쓰는 전법의 유형·특성·발동률·설명·등급·시즌을 채운다.</li>
 *   <li>무장 탭 — 장수의 나라·진영·성향·병종·수치와 고유전법을 채운다.</li>
 *   <li>버프 탭 — 회심·관통·침묵 같은 용어 설명.</li>
 * </ol>
 * 전법이 장수보다 먼저인 이유는, 장수의 고유전법을 연결할 때 이름이 이미 있어야
 * 값을 덮어쓰지 않고 이어붙일 수 있기 때문이다.
 */
@RestController
@RequestMapping("/api/sheets")
public class SheetSyncController {

    private final GeneralSheetSyncService generalSync;
    private final TacticSheetSyncService tacticSync;

    public SheetSyncController(GeneralSheetSyncService generalSync,
            TacticSheetSyncService tacticSync) {
        this.generalSync = generalSync;
        this.tacticSync = tacticSync;
    }

    /**
     * 통합 동기화 결과.
     *
     * @param warnings 사람이 확인해야 할 것들. 시트 오타나 명단 불일치가 여기 담긴다
     */
    public record CombinedResult(RosterResult roster, SheetResult tactics, SyncResult general,
            SheetResult buffs, List<String> warnings) {
    }

    @PostMapping("/sync")
    public CombinedResult sync() throws IOException, InterruptedException {
        RosterResult roster = generalSync.syncRoster();

        // 전법·버프 탭은 아직 설정하지 않았을 수 있다. 그것 때문에 전체가 실패하면 안 된다.
        List<String> warnings = new ArrayList<>();
        SheetResult tactics = optional(warnings, "전법 탭", tacticSync::syncTactics);
        SyncResult general = generalSync.sync();
        SheetResult buffs = optional(warnings, "버프 탭", tacticSync::syncBuffs);

        if (!roster.suspectedTypos().isEmpty()) {
            warnings.add("오타로 보여 만들지 않은 전법 이름: " + String.join(" / ", roster.suspectedTypos()));
        }
        if (!roster.missingGenerals().isEmpty()) {
            warnings.add("마스터 목록에는 있으나 DB 에 없는 장수 %d명: %s. 나라를 몰라 자동으로 만들지 않았습니다."
                    .formatted(roster.missingGenerals().size(),
                            String.join(", ", roster.missingGenerals())));
        }
        if (!roster.extraGenerals().isEmpty()) {
            warnings.add("DB 에만 있는 장수 %d명: %s"
                    .formatted(roster.extraGenerals().size(),
                            String.join(", ", roster.extraGenerals())));
        }
        if (tactics != null && !tactics.skipped().isEmpty()) {
            warnings.add("전법 탭에서 알 수 없는 값으로 건너뛴 행: " + String.join(" / ", tactics.skipped()));
        }
        if (buffs != null && !buffs.skipped().isEmpty()) {
            warnings.add("버프 탭에서 알 수 없는 값으로 건너뛴 행: " + String.join(" / ", buffs.skipped()));
        }
        if (!general.notFound().isEmpty()) {
            warnings.add("무장 시트에는 있으나 장수 명단에 없는 이름 %d개: %s"
                    .formatted(general.notFound().size(), String.join(", ", general.notFound())));
        }
        if (!general.skipped().isEmpty()) {
            warnings.add("분류 값을 알 수 없어 건너뛴 행: " + String.join(" / ", general.skipped()));
        }

        return new CombinedResult(roster, tactics, general, buffs, warnings);
    }

    @FunctionalInterface
    private interface SheetTask {
        SheetResult run() throws IOException, InterruptedException;
    }

    /**
     * 설정되지 않았거나 시트를 못 받은 탭은 «없는 것» 으로 넘긴다.
     *
     * <p>탭 하나가 빠졌다고 나머지 동기화까지 실패하면, 정작 되는 것도 못 쓰게 된다.
     * 대신 왜 건너뛰었는지는 반드시 남긴다. 조용히 지나가면 «반영됐겠지» 라고 착각한다.
     */
    private SheetResult optional(List<String> warnings, String what, SheetTask task)
            throws IOException, InterruptedException {
        try {
            return task.run();
        } catch (IllegalStateException e) {
            warnings.add("%s 를 건너뛰었습니다: %s".formatted(what, e.getMessage()));
            return null;
        }
    }
}
