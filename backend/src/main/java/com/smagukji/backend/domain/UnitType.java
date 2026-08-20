package com.smagukji.backend.domain;

/**
 * 병종. DB 의 general.unit_type 체크 제약과 값이 일치해야 한다.
 *
 * <p>값은 실제 게임 데이터(사용자 스프레드시트)를 따른다. 예전에 카드 아이콘을 보고
 * 세웠던 추정(기병/보병/궁병/창병/병기)은 폐기했다.
 */
public enum UnitType {

    SHIELD("방패병"),
    SPEAR("창병"),
    BOW("궁병"),
    CAVALRY("기병");

    private final String label;

    UnitType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
