package com.smagukji.backend.domain;

/**
 * 전법 분류. DB 의 tactic.category 체크 제약과 값이 일치해야 한다.
 *
 * <p>{@link #triggersByChance()} 는 발동확률 판정을 거치는 분류인지를 뜻하며,
 * 부대 분석의 기대 발동 수 계산에서 사용한다.
 */
public enum TacticCategory {

    PASSIVE("패시브", false),
    ACTIVE("액티브", true),
    COMMAND("지휘", false),
    PURSUIT("추격", true),
    ASSAULT("돌격", true),
    FORMATION("진법", false),
    INTERNAL("내정", false);

    private final String label;
    private final boolean triggersByChance;

    TacticCategory(String label, boolean triggersByChance) {
        this.label = label;
        this.triggersByChance = triggersByChance;
    }

    public String label() {
        return label;
    }

    /** 매 턴 확률 판정으로 발동하는 분류인지 여부. 지휘/패시브는 상시 적용이라 false. */
    public boolean triggersByChance() {
        return triggersByChance;
    }
}
