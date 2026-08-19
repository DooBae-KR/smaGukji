package com.smagukji.backend.domain;

/** 동맹원 마커. DB 의 member_marker.marker_type 체크 제약과 값이 일치해야 한다. */
public enum MarkerType {

    /** 주의 — 주황 */
    CAUTION("주의", "#e8863a"),
    /** 길작러 — 초록 */
    GILJAK("길작러", "#3fa15e"),
    /** 액티브 — 파랑 */
    ACTIVE("액티브", "#3f7fd0");

    private final String label;
    private final String color;

    MarkerType(String label, String color) {
        this.label = label;
        this.color = color;
    }

    public String label() {
        return label;
    }

    public String color() {
        return color;
    }

    /** 주의 마커는 켤 때 사유 입력이 필요하다. */
    public boolean requiresReason() {
        return this == CAUTION;
    }
}
