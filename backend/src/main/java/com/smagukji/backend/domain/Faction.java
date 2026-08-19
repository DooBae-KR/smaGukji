package com.smagukji.backend.domain;

/** 세력. DB 의 general.faction 체크 제약과 값이 일치해야 한다. */
public enum Faction {

    WEI("위"),
    SHU("촉"),
    WU("오"),
    QUN("군"),
    HAN("한");

    private final String label;

    Faction(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
