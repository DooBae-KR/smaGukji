package com.smagukji.backend.domain;

/**
 * 무장 진영(배치). DB 의 general.camp 체크 제약과 값이 일치해야 한다.
 *
 * <p>세력(위/촉/오/군)과는 다른 축이다. 세력은 소속이고, 진영은 부대 안에서의 배치 위치다.
 */
public enum Camp {

    FRONT("전열"),
    BALANCE("균형"),
    BACK("후열");

    private final String label;

    Camp(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
