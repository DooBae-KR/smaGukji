package com.smagukji.backend.domain;

/** 전법 능력 타입. DB 의 tactic.ability_type 체크 제약과 값이 일치해야 한다. */
public enum AbilityType {

    WEAPON("병기"),
    STRATEGY("책략"),
    DEFENSE("방어"),
    SUPPORT("보조"),
    CONTROL("제어");

    private final String label;

    AbilityType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 피해를 목적으로 하는 타입인지. 역할 균형 분석에서 사용한다. */
    public boolean isOffensive() {
        return this == WEAPON || this == STRATEGY;
    }
}
