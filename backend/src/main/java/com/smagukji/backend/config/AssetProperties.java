package com.smagukji.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 이미지 원본 폴더 설정.
 *
 * @param sourceDir       장수/전법 하위 폴더를 가진 원본 디렉터리 경로
 * @param importOnStartup 애플리케이션 기동 시 자동으로 적재할지 여부
 */
@ConfigurationProperties(prefix = "app.assets")
public record AssetProperties(String sourceDir, boolean importOnStartup) {
}
