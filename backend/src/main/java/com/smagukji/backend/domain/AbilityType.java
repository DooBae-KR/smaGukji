package com.smagukji.backend.domain;

/** 전법 능력 타입. DB 의 tactic.ability_type 체크 제약과 값이 일치해야 한다. */
public enum AbilityType {

    HEAL("치유"),
    SUPPORT("보조"),
    STRATEGY("책략"),
    WEAPON("병기"),
    DEFENSE("방어"),
    CIVIL_MARTIAL("문무"),
    /** 실제 데이터에서 아직 관측되지 않았다. 예비로 남겨둔다. */
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
