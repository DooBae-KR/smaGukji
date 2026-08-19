package com.smagukji.backend.service;

import java.util.List;

/**
 * 이미지 적재 결과 요약.
 *
 * @param inserted  새로 추가된 건수
 * @param updated   내용이 바뀌어 갱신된 건수
 * @param unchanged sha256 이 동일해 건너뛴 건수
 * @param failures  읽기/저장에 실패한 파일과 사유
 */
public record AssetImportResult(int inserted, int updated, int unchanged, List<String> failures) {

    public int total() {
        return inserted + updated + unchanged;
    }
}
