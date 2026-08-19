package com.smagukji.backend.service.analysis;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.smagukji.backend.domain.AbilityType;
import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.General;
import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.TacticCategory;
import com.smagukji.backend.domain.Team;
import com.smagukji.backend.domain.TeamSlot;
import com.smagukji.backend.domain.TeamSlotTactic;
import com.smagukji.backend.domain.UnitType;
import java.math.BigDecimal;
import java.util.Random;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 분석 로직 단위 테스트.
 *
 * <p>여기서 쓰는 수치는 전부 합성값이다. 실제 게임 데이터가 아직 없어서 실 DB 에 넣지 않고
 * 테스트 픽스처로만 사용한다.
 */
class TeamAnalysisServiceTest {

    private final TeamAnalysisService service = new TeamAnalysisService();

    private static final BigDecimal COST_5 = new BigDecimal("5.0");

    private Team team(BigDecimal costLimit) {
        return new Team("테스트 부대", costLimit);
    }

    private General general(String name, Faction faction) {
        return new General(name, faction, COST_5);
    }

    private Tactic tactic(String name, TacticCategory category, String rate) {
        Tactic t = new Tactic(name);
        t.setCategory(category);
        if (rate != null) {
            t.setTriggerRate(new BigDecimal(rate));
        }
        t.setAbilityType(AbilityType.WEAPON);
        return t;
    }

    private Random rng() {
        return new Random(42);
    }

    @Test
    @DisplayName("동일 세력 3인은 PURE 로 판정한다")
    void detectsPureFaction() {
        Team team = team(new BigDecimal("15.0"));
        team.addSlot(new TeamSlot(1, general("관우", Faction.SHU)));
        team.addSlot(new TeamSlot(2, general("장비", Faction.SHU)));
        team.addSlot(new TeamSlot(3, general("조운", Faction.SHU)));

        TeamAnalysis result = service.analyze(team, 8, 1000, rng());

        assertEquals("PURE", result.faction().tier());
        assertEquals("촉", result.faction().dominantFaction());
        assertEquals(3, result.faction().dominantCount());
    }

    @Test
    @DisplayName("세력이 전부 다르면 SCATTERED 로 판정하고 경고한다")
    void detectsScatteredFaction() {
        Team team = team(new BigDecimal("15.0"));
        team.addSlot(new TeamSlot(1, general("관우", Faction.SHU)));
        team.addSlot(new TeamSlot(2, general("조조", Faction.WEI)));
        team.addSlot(new TeamSlot(3, general("손권", Faction.WU)));

        TeamAnalysis result = service.analyze(team, 8, 1000, rng());

        assertEquals("SCATTERED", result.faction().tier());
        assertTrue(hasCode(result, "FACTION_SCATTERED"));
    }

    @Test
    @DisplayName("코스트 상한을 넘으면 ERROR 를 낸다")
    void flagsCostOverBudget() {
        Team team = team(new BigDecimal("10.0"));
        team.addSlot(new TeamSlot(1, general("관우", Faction.SHU)));
        team.addSlot(new TeamSlot(2, general("장비", Faction.SHU)));
        team.addSlot(new TeamSlot(3, general("조운", Faction.SHU)));

        TeamAnalysis result = service.analyze(team, 8, 1000, rng());

        assertTrue(result.cost().overBudget());
        assertEquals(0, new BigDecimal("15.0").compareTo(result.cost().total()));
        assertTrue(hasCode(result, "COST_OVER"));
    }

    @Test
    @DisplayName("발동확률 100% 전법 하나면 매 턴 반드시 발동한다")
    void simulatesCertainTrigger() {
        Team team = team(new BigDecimal("15.0"));
        TeamSlot slot = new TeamSlot(1, general("관우", Faction.SHU));
        slot.addTactic(new TeamSlotTactic(1, tactic("확정발동", TacticCategory.ACTIVE, "100")));
        team.addSlot(slot);

        TeamAnalysis result = service.analyze(team, 8, 2000, rng());

        assertEquals(1, result.simulation().evaluatedTactics());
        assertEquals(1.0, result.simulation().expectedPerTurn(), 1e-9);
        assertEquals(1.0, result.simulation().probAtLeastOne(), 1e-9);
    }

    @Test
    @DisplayName("발동확률 50% 전법 2개의 기대 발동 수는 1.0 에 수렴한다")
    void simulatesExpectedActivations() {
        Team team = team(new BigDecimal("15.0"));
        TeamSlot slot = new TeamSlot(1, general("관우", Faction.SHU));
        slot.addTactic(new TeamSlotTactic(1, tactic("반반1", TacticCategory.ACTIVE, "50")));
        slot.addTactic(new TeamSlotTactic(2, tactic("반반2", TacticCategory.ACTIVE, "50")));
        team.addSlot(slot);

        TeamAnalysis result = service.analyze(team, 8, 50_000, rng());

        // 기대값 1.0, 최소 1개 발동 확률 0.75
        assertEquals(1.0, result.simulation().expectedPerTurn(), 0.02);
        assertEquals(0.75, result.simulation().probAtLeastOne(), 0.02);
    }

    @Test
    @DisplayName("지휘 전법은 확률 판정 없이 항상 적용된다")
    void commandTacticAlwaysApplies() {
        Team team = team(new BigDecimal("15.0"));
        TeamSlot slot = new TeamSlot(1, general("관우", Faction.SHU));
        // 지휘는 발동확률이 없어도 상시 적용이라 평가 대상이다.
        slot.addTactic(new TeamSlotTactic(1, tactic("지휘전법", TacticCategory.COMMAND, null)));
        team.addSlot(slot);

        TeamAnalysis result = service.analyze(team, 5, 1000, rng());

        assertEquals(1, result.simulation().evaluatedTactics());
        assertEquals(0, result.simulation().skippedTactics());
        assertEquals(1.0, result.simulation().expectedPerTurn(), 1e-9);
    }

    @Test
    @DisplayName("데이터가 비어 있으면 시뮬레이션에서 제외하고 confidence 를 LOW 로 낮춘다")
    void missingDataLowersConfidence() {
        Team team = team(new BigDecimal("15.0"));
        TeamSlot slot = new TeamSlot(1, general("관우", Faction.SHU));
        slot.addTactic(new TeamSlotTactic(1, new Tactic("미입력전법")));
        team.addSlot(slot);

        TeamAnalysis result = service.analyze(team, 8, 1000, rng());

        assertEquals(0, result.simulation().evaluatedTactics());
        assertEquals(1, result.simulation().skippedTactics());
        assertEquals("LOW", result.confidence());
        assertTrue(result.scoreCoverage() < 100);
        assertTrue(hasCode(result, "SCORE_LOW_CONFIDENCE"));
        assertTrue(hasCode(result, "SIM_NO_DATA"));
    }

    @Test
    @DisplayName("데이터가 모두 채워지면 confidence 가 HIGH 가 된다")
    void completeDataGivesHighConfidence() {
        Team team = team(new BigDecimal("15.0"));
        for (int i = 1; i <= 3; i++) {
            General g = general("장수" + i, Faction.SHU);
            g.setUnitType(UnitType.CAVALRY);
            TeamSlot slot = new TeamSlot(i, g);
            slot.addTactic(new TeamSlotTactic(1, tactic("전법" + i + "a", TacticCategory.ACTIVE, "50")));
            slot.addTactic(new TeamSlotTactic(2, tactic("전법" + i + "b", TacticCategory.ACTIVE, "50")));
            team.addSlot(slot);
        }

        TeamAnalysis result = service.analyze(team, 8, 5000, rng());

        assertEquals("HIGH", result.confidence());
        assertEquals(100.0, result.scoreCoverage(), 1e-9);
        assertEquals(0, result.unitType().unknownCount());
        assertTrue(result.unitType().uniform());
        assertFalse(hasCode(result, "SCORE_LOW_CONFIDENCE"));
    }

    @Test
    @DisplayName("같은 전법을 여러 장수가 장착하면 중복으로 잡는다")
    void detectsDuplicateTactics() {
        Team team = team(new BigDecimal("15.0"));
        TeamSlot a = new TeamSlot(1, general("관우", Faction.SHU));
        a.addTactic(new TeamSlotTactic(1, tactic("강습", TacticCategory.ACTIVE, "80")));
        TeamSlot b = new TeamSlot(2, general("장비", Faction.SHU));
        b.addTactic(new TeamSlotTactic(1, tactic("강습", TacticCategory.ACTIVE, "80")));
        team.addSlot(a);
        team.addSlot(b);

        TeamAnalysis result = service.analyze(team, 8, 1000, rng());

        assertEquals(1, result.tactics().duplicateNames().size());
        assertEquals("강습", result.tactics().duplicateNames().get(0));
        assertTrue(hasCode(result, "TACTIC_DUPLICATE"));
    }

    @Test
    @DisplayName("같은 seed 면 결과가 항상 같다")
    void isDeterministicForSameSeed() {
        Team team = team(new BigDecimal("15.0"));
        TeamSlot slot = new TeamSlot(1, general("관우", Faction.SHU));
        slot.addTactic(new TeamSlotTactic(1, tactic("반반", TacticCategory.ACTIVE, "50")));
        team.addSlot(slot);

        TeamAnalysis first = service.analyze(team, 8, 5000, new Random(7));
        TeamAnalysis second = service.analyze(team, 8, 5000, new Random(7));

        assertEquals(first.simulation().expectedPerTurn(), second.simulation().expectedPerTurn());
        assertEquals(first.score(), second.score());
    }

    @Test
    @DisplayName("장수 4명을 넣으려 하면 거부한다")
    void rejectsFourthGeneral() {
        Team team = team(new BigDecimal("20.0"));
        for (int i = 1; i <= 3; i++) {
            team.addSlot(new TeamSlot(i, general("장수" + i, Faction.SHU)));
        }

        var e = org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> team.addSlot(new TeamSlot(3, general("초과장수", Faction.SHU))));
        assertTrue(e.getMessage().contains("최대 3명"));
    }

    private static boolean hasCode(TeamAnalysis result, String code) {
        return result.findings().stream().anyMatch(f -> f.code().equals(code));
    }
}
