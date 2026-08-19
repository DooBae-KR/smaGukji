package com.smagukji.backend.config;

import com.smagukji.backend.service.AssetImageImportService;
import com.smagukji.backend.service.AssetImportResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * {@code app.assets.import-on-startup=true} 일 때 기동 직후 이미지를 적재한다.
 * 적재에 실패해도 애플리케이션은 계속 뜬다.
 */
@Component
@ConditionalOnProperty(prefix = "app.assets", name = "import-on-startup", havingValue = "true")
public class AssetImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AssetImportRunner.class);

    private final AssetImageImportService importService;

    public AssetImportRunner(AssetImageImportService importService) {
        this.importService = importService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            AssetImportResult result = importService.importAll();
            log.info("기동 시 이미지 적재: 총 {}건 (신규 {}, 갱신 {}, 변경없음 {})",
                    result.total(), result.inserted(), result.updated(), result.unchanged());
            result.failures().forEach(f -> log.warn("적재 실패 - {}", f));
        } catch (RuntimeException e) {
            log.error("기동 시 이미지 적재 실패. POST /api/assets/import 로 다시 시도하세요.", e);
        }
    }
}
