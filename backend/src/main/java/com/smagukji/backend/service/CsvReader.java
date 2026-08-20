package com.smagukji.backend.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 최소 기능의 CSV 리더.
 *
 * <p>RFC 4180 의 따옴표 규칙(따옴표 안의 쉼표/개행, {@code ""} 이스케이프)만 지원한다.
 * 전법/장수 데이터는 효과 설명에 쉼표가 들어가므로 따옴표 처리가 필수다.
 */
final class CsvReader {

    private CsvReader() {
    }

    /** 첫 줄을 헤더로 보고, 각 행을 헤더명 -> 값 맵으로 돌려준다. */
    static List<Map<String, String>> parse(String csv) {
        List<List<String>> rows = parseRows(csv);
        if (rows.isEmpty()) {
            return List.of();
        }

        List<String> header = rows.get(0).stream()
                .map(h -> h.trim().replace("﻿", ""))
                .toList();

        List<Map<String, String>> result = new ArrayList<>();
        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            if (row.size() == 1 && row.get(0).isBlank()) {
                continue;
            }
            Map<String, String> map = new LinkedHashMap<>();
            for (int c = 0; c < header.size(); c++) {
                String value = c < row.size() ? row.get(c) : "";
                map.put(header.get(c), value == null ? "" : value.trim());
            }
            result.add(map);
        }
        return result;
    }

    static List<List<String>> parseRows(String csv) {
        List<List<String>> rows = new ArrayList<>();
        List<String> current = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < csv.length(); i++) {
            char ch = csv.charAt(i);

            if (inQuotes) {
                if (ch == '"') {
                    // 연속된 따옴표는 리터럴 따옴표 하나를 뜻한다.
                    if (i + 1 < csv.length() && csv.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field.append(ch);
                }
                continue;
            }

            switch (ch) {
                case '"' -> inQuotes = true;
                case ',' -> {
                    current.add(field.toString());
                    field.setLength(0);
                }
                case '\r' -> {
                    // \r\n 은 \n 에서 처리한다.
                }
                case '\n' -> {
                    current.add(field.toString());
                    field.setLength(0);
                    rows.add(current);
                    current = new ArrayList<>();
                }
                default -> field.append(ch);
            }
        }

        if (field.length() > 0 || !current.isEmpty()) {
            current.add(field.toString());
            rows.add(current);
        }
        return rows;
    }
}
