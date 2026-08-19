package com.smagukji.backend.domain;

/** 전법 품질. DB 의 tactic.quality 체크 제약과 값이 일치해야 한다. */
public enum TacticQuality {

    GOLD("황금", 4),
    PURPLE("보라", 3),
    BLUE("파랑", 2),
    GREEN("초록", 1);

    private final String label;
    private final int weight;

    TacticQuality(String label, int weight) {
        this.label = label;
        this.weight = weight;
    }

    public String label() {
        return label;
    }

    /** 품질 점수 가중치. 높을수록 좋은 전법. */
    public int weight() {
        return weight;
    }
}
