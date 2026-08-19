package com.smagukji.backend.domain;

/** 전법 획득 경로. DB 의 tactic.source 체크 제약과 값이 일치해야 한다. */
public enum TacticSource {

    SIGNATURE("고유"),
    INHERITED("전수"),
    EVENT("이벤트"),
    BASIC("기본");

    private final String label;

    TacticSource(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
