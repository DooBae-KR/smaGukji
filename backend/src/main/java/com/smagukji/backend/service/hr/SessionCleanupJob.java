package com.smagukji.backend.service.hr;

import com.smagukji.backend.repository.AppSessionRepository;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 만료된 세션을 주기적으로 지운다.
 *
 * <p>{@code requireSession} 은 만료를 확인만 하고 행을 남기므로, 이 작업이 없으면
 * {@code app_session} 이 로그인 횟수만큼 무한정 쌓인다.
 */
@Component
public class SessionCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(SessionCleanupJob.class);

    private final AppSessionRepository sessionRepository;

    public SessionCleanupJob(AppSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    /** 기동 1분 뒤 첫 실행, 이후 1시간마다. */
    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    @Transactional
    public void purgeExpired() {
        int removed = sessionRepository.deleteExpired(OffsetDateTime.now());
        if (removed > 0) {
            log.info("만료 세션 {}건 정리", removed);
        }
    }
}
