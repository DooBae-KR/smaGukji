package com.smagukji.backend.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 무장 성향. DB 의 general.dispositions 체크 제약과 값이 일치해야 한다.
 *
 * <p>한 장수가 <b>여러 성향</b>을 가질 수 있어 배열로 저장한다. (예: 전위 = 방어 + 병기)
 *
 * <p>{@link #SUPPORT_DEFENSE}(보조방어)와 {@link #CIVIL_MARTIAL_SUPPORT}(문무보조)는
 * 원본 시트에 한 덩어리로 적혀 있어 «보조 + 방어» 로 쪼개지 않는다. 임의로 분해하면
 * 원본에 없는 의미를 만들어내는 셈이 된다.
 */
public enum Disposition {

    HEAL("치유"),
    SUPPORT("보조"),
    DEFENSE("방어"),
    SUPPORT_DEFENSE("보조방어"),
    CIVIL_MARTIAL("문무"),
    CIVIL_MARTIAL_SUPPORT("문무보조"),
    STRATEGY("책략"),
    WEAPON("병기");

    private final String label;

    Disposition(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 알 수 없는 코드는 예외 대신 빈 값으로 돌려준다. DB 에 새 값이 생겨도 조회가 죽지 않게. */
    public static Optional<Disposition> of(String code) {
        return Arrays.stream(values()).filter(d -> d.name().equals(code)).findFirst();
    }
}
