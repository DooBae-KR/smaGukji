package com.smagukji.backend.domain;

/** 병종. DB 의 general.unit_type 체크 제약과 값이 일치해야 한다. */
public enum UnitType {

    CAVALRY("기병"),
    INFANTRY("보병"),
    ARCHER("궁병"),
    SPEARMAN("창병"),
    SIEGE("병기");

    private final String label;

    UnitType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
