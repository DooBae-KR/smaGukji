package com.smagukji.backend.service.hr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 주차 시트 파서의 순수 함수 검증. DB 없이 돈다(CI 의 service.* 범위).
 *
 * <p>여기 있는 «14만» 같은 값은 실제 업로드 파일(MemberWeek20260823.xlsx)에서 그대로 가져온 것이다.
 */
class MemberWeekImportServiceTest {

    @Test
    @DisplayName("파일명 — MemberWeek + 8자리만 인식한다 (규칙 유지, 사용자 결정)")
    void fileNameDate() {
        assertEquals(LocalDate.of(2026, 8, 23),
                MemberWeekImportService.parseSnapshotDate("MemberWeek20260823.xlsx").orElseThrow());
        assertTrue(MemberWeekImportService.parseSnapshotDate("260823.xlsx").isEmpty());
        assertTrue(MemberWeekImportService.parseSnapshotDate(null).isEmpty());
    }

    @Test
    @DisplayName("숫자 — 게임이 줄여 쓴 «14만» 표기를 읽는다")
    void koreanNumberUnits() {
        assertEquals(140_000L, MemberWeekImportService.parseNumber("14만"));
        assertEquals(440_000L, MemberWeekImportService.parseNumber("44만"));
        assertEquals(14_000L, MemberWeekImportService.parseNumber("1.4만"));
        assertEquals(100_000_000L, MemberWeekImportService.parseNumber("1억"));
        assertEquals(120_000_000L, MemberWeekImportService.parseNumber("1억 2000만"));
        assertEquals(45_672L, MemberWeekImportService.parseNumber("45672"));
        assertEquals(97_805L, MemberWeekImportService.parseNumber("97,805"));
        assertEquals(0L, MemberWeekImportService.parseNumber("0"));
        assertEquals(-5L, MemberWeekImportService.parseNumber("-5"));
    }

    @Test
    @DisplayName("숫자 — 단위 뒤에 다른 글자가 붙으면 숫자로 보지 않는다")
    void rejectsNonNumbers() {
        assertNull(MemberWeekImportService.parseNumber("14만점"));
        assertNull(MemberWeekImportService.parseNumber("없음"));
        assertNull(MemberWeekImportService.parseNumber("--"));
        assertNull(MemberWeekImportService.parseNumber("-"));
        assertNull(MemberWeekImportService.parseNumber(""));
        assertNull(MemberWeekImportService.parseNumber(null));
    }
}
