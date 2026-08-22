package com.smagukji.backend.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 스프레드시트의 열 위치를 «머리글» 로 찾는다.
 *
 * <p>왜 필요한가: 예전에는 열 번호를 코드에 그대로 박아뒀는데, 무장 시트에 «나라» 열이
 * 하나 끼어들자 그 뒤가 전부 한 칸씩 밀렸다. 그 상태로 동기화를 돌리면 진영 칸에 나라가,
 * 성향 칸에 진영이 들어간다. 오류가 나지 않고 «조용히 틀린 값» 이 박히는 것이라 더 위험하다.
 *
 * <p>두 가지 성가신 점을 흡수한다.
 * <ul>
 *   <li>머리글에 줄바꿈·괄호가 섞인다(«무력\n(50렙)»). 공백을 없애고 앞부분만 맞춰 본다.</li>
 *   <li>병합 셀 때문에 머리글과 값의 열이 어긋난다. 머리글 칸에 값이 하나도 없고
 *       바로 오른쪽 칸에 값이 있으면 그쪽을 쓴다.</li>
 * </ul>
 */
final class SheetColumns {

    private final Map<String, Integer> index;

    private SheetColumns(Map<String, Integer> index) {
        this.index = index;
    }

    static SheetColumns of(List<List<String>> rows) {
        Map<String, Integer> found = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            return new SheetColumns(found);
        }
        List<String> header = rows.get(0);
        for (int c = 0; c < header.size(); c++) {
            String key = squash(header.get(c));
            if (!key.isEmpty()) {
                found.putIfAbsent(key, shifted(rows, c));
            }
        }
        return new SheetColumns(found);
    }

    /** 머리글 칸이 비어 있고 오른쪽 칸에만 값이 있으면 오른쪽을 쓴다(병합 셀). */
    private static int shifted(List<List<String>> rows, int c) {
        int here = 0;
        int right = 0;
        for (int i = 1; i < rows.size(); i++) {
            if (!cell(rows.get(i), c).isEmpty()) {
                here++;
            }
            if (!cell(rows.get(i), c + 1).isEmpty()) {
                right++;
            }
        }
        return here == 0 && right > 0 ? c + 1 : c;
    }

    private static String squash(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").replace("﻿", "");
    }

    private Integer find(String header) {
        String key = squash(header);
        for (Map.Entry<String, Integer> e : index.entrySet()) {
            if (e.getKey().startsWith(key)) {
                return e.getValue();
            }
        }
        return null;
    }

    int require(String header) {
        Integer c = find(header);
        if (c == null) {
            throw new IllegalStateException(
                    "시트에 «%s» 열이 없습니다. 머리글을 확인하세요. 읽은 머리글: %s"
                            .formatted(header, index.keySet()));
        }
        return c;
    }

    /** 없어도 되는 열. 없으면 -1 을 주고 {@link #cell} 이 빈 값으로 처리한다. */
    int optional(String header) {
        Integer c = find(header);
        return c == null ? -1 : c;
    }

    /** 없는 열(-1)이나 짧은 행은 빈 값으로 본다. 시트 끝의 빈 칸은 아예 오지 않는다. */
    static String cell(List<String> row, int index) {
        return index >= 0 && index < row.size() ? row.get(index).trim() : "";
    }
}
