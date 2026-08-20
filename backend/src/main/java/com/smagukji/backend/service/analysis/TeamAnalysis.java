package com.smagukji.backend.service.analysis;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 부대 분석 결과.
 *
 * <p>초기 데이터는 전법 상세(분류/발동확률)와 장수 병종이 비어 있다. 그런 항목은 추정하지 않고
 * {@code dataCompleteness} 와 {@link Finding} 으로 "미입력"임을 명시한다. 빈 데이터를 0 으로
 * 취급해 점수를 매기면 잘못된 결론을 주기 때문이다.
 *
 * <p>다만 미입력 항목을 채점에서 빼기만 하면 "모르는 것"이 "좋은 것"으로 둔갑한다. 그래서
 * {@code scoreCoverage}(채점 모델 중 실제로 평가된 비중)와 {@code confidence} 를 함께 준다.
 * confidence 가 LOW 인 점수는 편성의 우열이 아니라 데이터 입력 상태를 반영한 값이다.
 */
public record TeamAnalysis(
        UUID teamId,
        String teamName,
        int score,
        String grade,
        double scoreCoverage,
        String confidence,
        RosterAnalysis roster,
        FactionAnalysis faction,
        UnitTypeAnalysis unitType,
        TacticAnalysis tactics,
        SimulationSummary simulation,
        List<Finding> findings) {

    /**
     * 편성 구성.
     *
     * <p>예전에는 코스트 합계와 상한을 담았는데, 이 게임에는 코스트라는 개념이 없다.
     * 카드에 적힌 숫자는 레벨이고, 코스트 제한 없이 어떤 장수든 넣을 수 있다.
     * 그래서 «몇 자리를 채웠는가» 만 남겼다.
     *
     * @param generalCount 배치된 장수 수
     * @param slotCapacity 채울 수 있는 자리 수
     */
    public record RosterAnalysis(
            int generalCount,
            int slotCapacity) {
    }

    /**
     * 세력 분석.
     *
     * @param tier PURE=3인 동일세력, PAIR=2인 동일세력, SCATTERED=전원 상이
     */
    public record FactionAnalysis(
            Map<String, Integer> countByFaction,
            String dominantFaction,
            int dominantCount,
            String tier,
            String note) {
    }

    /**
     * 병종 분석.
     *
     * @param unknownCount 병종 미입력 장수 수. 0 이 아니면 이 분석은 참고용이다.
     */
    public record UnitTypeAnalysis(
            Map<String, Integer> countByUnitType,
            int unknownCount,
            boolean uniform,
            String note) {
    }

    /**
     * 전법 구성 분석.
     *
     * @param dataCompleteness 분류/발동확률이 채워진 전법 비율 0~100
     */
    public record TacticAnalysis(
            int equippedCount,
            int slotCapacity,
            Map<String, Integer> countByCategory,
            Map<String, Integer> countByAbilityType,
            Map<String, Integer> countByQuality,
            Double averageTriggerRate,
            double dataCompleteness,
            List<String> duplicateNames,
            List<String> missingDataNames) {
    }

    /**
     * 몬테카를로 발동 시뮬레이션 요약.
     *
     * @param evaluatedTactics    확률 판정이 가능한(데이터가 채워진) 전법 수
     * @param skippedTactics      데이터 미입력으로 시뮬레이션에서 제외된 전법 수
     * @param expectedPerTurn     턴당 기대 발동 수
     * @param probAtLeastOne      한 턴에 최소 1개가 발동할 확률
     * @param activationHistogram 한 턴 발동 개수별 확률 (키=발동 수)
     * @param perTacticExpected   전법별 전체 턴 기대 발동 수
     */
    public record SimulationSummary(
            int turns,
            int iterations,
            int evaluatedTactics,
            int skippedTactics,
            double expectedPerTurn,
            double probAtLeastOne,
            Map<Integer, Double> activationHistogram,
            Map<String, Double> perTacticExpected) {
    }

    /**
     * 개별 발견 사항.
     *
     * @param severity ERROR=편성 불가, WARN=검토 필요, INFO=참고
     */
    public record Finding(String severity, String code, String message) {

        public static Finding error(String code, String message) {
            return new Finding("ERROR", code, message);
        }

        public static Finding warn(String code, String message) {
            return new Finding("WARN", code, message);
        }

        public static Finding info(String code, String message) {
            return new Finding("INFO", code, message);
        }
    }
}
