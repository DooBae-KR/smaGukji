package com.smagukji.backend.config;

import com.smagukji.backend.service.GeneralSheetSyncService;
import com.smagukji.backend.service.GeneralSheetSyncService.RosterResult;
import com.smagukji.backend.service.GeneralSheetSyncService.SyncResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * {@code app.sheet.sync-on-startup=true} 일 때 기동 직후 시트를 한 번 읽어 반영한다.
 *
 * <p>평소에는 «데이터» 탭의 버튼(POST /api/sheets/sync)으로 하지만, 그 API 는 관리자
 * 토큰이 필요하다. 계정이 아직 없거나 배포 직후처럼 화면에 들어갈 수 없을 때 쓰라고 둔다.
 *
 * <p>기본값은 꺼짐이다. 매 기동마다 시트를 덮어쓰면, 시트가 편집 중인 상태로 저장된
 * 순간에 그 중간 값이 DB 에 박힐 수 있다(전에 실제로 겪은 문제다).
 *
 * <p>실패해도 애플리케이션은 계속 뜬다. 동기화는 부가 작업이지 기동 조건이 아니다.
 */
@Component
@ConditionalOnProperty(prefix = "app.sheet", name = "sync-on-startup", havingValue = "true")
public class SheetSyncRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SheetSyncRunner.class);

    private final GeneralSheetSyncService syncService;
    private final com.smagukji.backend.service.TacticSheetSyncService tacticSync;

    public SheetSyncRunner(GeneralSheetSyncService syncService,
            com.smagukji.backend.service.TacticSheetSyncService tacticSync) {
        this.syncService = syncService;
        this.tacticSync = tacticSync;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 순서가 중요하다. 이름이 먼저 있어야 장수의 고유전법 연결이 자연스럽다.
            RosterResult roster = syncService.syncRoster();
            var tactics = tacticSync.syncTactics();
            SyncResult general = syncService.sync();
            var buffs = tacticSync.syncBuffs();

            log.info("기동 시 시트 동기화 - 전법 신규 {}/갱신 {}, 장수 갱신 {}, 버프 신규 {}/갱신 {}",
                    tactics.created(), tactics.updated(), general.updated(),
                    buffs.created(), buffs.updated());

            // 사람이 확인해야 할 것들은 조용히 넘기지 않는다.
            roster.suspectedTypos().forEach(t -> log.warn("시트 오타로 보임 - {}", t));
            general.notFound().forEach(n -> log.warn("시트에는 있으나 장수 명단에 없음 - {}", n));
            general.skipped().forEach(s -> log.warn("분류를 알 수 없어 건너뜀 - {}", s));
            tactics.skipped().forEach(s -> log.warn("전법 탭 건너뜀 - {}", s));
            buffs.skipped().forEach(s -> log.warn("버프 탭 건너뜀 - {}", s));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("기동 시 시트 동기화가 중단되었습니다.", e);
        } catch (Exception e) {
            log.error("기동 시 시트 동기화 실패. 나중에 «데이터» 탭에서 다시 시도하세요.", e);
        }
    }
}
