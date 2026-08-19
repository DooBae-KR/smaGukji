package com.smagukji.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CsvReaderTest {

    @Test
    @DisplayName("헤더와 값을 매핑한다")
    void parsesHeaderAndRows() {
        List<Map<String, String>> rows = CsvReader.parse("""
                name,category,triggerRate
                강습,액티브,80
                기문둔갑,액티브,50
                """);

        assertEquals(2, rows.size());
        assertEquals("강습", rows.get(0).get("name"));
        assertEquals("액티브", rows.get(0).get("category"));
        assertEquals("80", rows.get(0).get("triggerRate"));
        assertEquals("기문둔갑", rows.get(1).get("name"));
    }

    @Test
    @DisplayName("따옴표 안의 쉼표는 필드를 나누지 않는다")
    void keepsCommasInsideQuotes() {
        List<Map<String, String>> rows = CsvReader.parse("""
                name,effectText
                기문둔갑,"1턴 준비 후, 전체 적군에게 250%의 책략 피해를 준다"
                """);

        assertEquals(1, rows.size());
        assertEquals("1턴 준비 후, 전체 적군에게 250%의 책략 피해를 준다",
                rows.get(0).get("effectText"));
    }

    @Test
    @DisplayName("연속된 따옴표는 리터럴 따옴표 하나로 읽는다")
    void unescapesDoubledQuotes() {
        List<Map<String, String>> rows = CsvReader.parse("""
                name,effectText
                강습,"이른바 ""돌격"" 판정"
                """);

        assertEquals("이른바 \"돌격\" 판정", rows.get(0).get("effectText"));
    }

    @Test
    @DisplayName("따옴표 안의 개행은 같은 행으로 유지한다")
    void keepsNewlinesInsideQuotes() {
        List<Map<String, String>> rows = CsvReader.parse(
                "name,effectText\n강습,\"첫 줄\n둘째 줄\"\n");

        assertEquals(1, rows.size());
        assertTrue(rows.get(0).get("effectText").contains("\n"));
    }

    @Test
    @DisplayName("열이 모자란 행은 빈 문자열로 채운다")
    void padsShortRows() {
        List<Map<String, String>> rows = CsvReader.parse("""
                name,category,triggerRate
                강습
                """);

        assertEquals("강습", rows.get(0).get("name"));
        assertEquals("", rows.get(0).get("category"));
        assertEquals("", rows.get(0).get("triggerRate"));
    }

    @Test
    @DisplayName("빈 줄과 헤더만 있는 입력을 견딘다")
    void handlesBlankInput() {
        assertTrue(CsvReader.parse("").isEmpty());
        assertTrue(CsvReader.parse("name,category\n").isEmpty());
        assertEquals(1, CsvReader.parse("name\n강습\n\n").size());
    }
}
