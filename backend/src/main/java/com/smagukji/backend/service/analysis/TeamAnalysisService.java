package com.smagukji.backend.service.analysis;

import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.General;
import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.Team;
import com.smagukji.backend.domain.TeamSlot;
import com.smagukji.backend.domain.TeamSlotTactic;
import com.smagukji.backend.domain.UnitType;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.random.RandomGenerator;
import org.springframework.stereotype.Service;

/**
 * 부대 편성을 분석한다.
 *
 * <p>설계 원칙: 값이 비어 있으면 추정하지 않고 "미입력"으로 보고한다. 초기 데이터는 전법 상세와
 * 병종이 비어 있는데, 이를 0 이나 기본값으로 메우면 그럴듯하지만 틀린 점수가 나오기 때문이다.
 */
@Service
public class TeamAnalysisService {

    /** 시뮬레이션 기본 턴 수. 천하결전 전투가 대략 8턴 안에 끝나는 것을 기준으로 잡았다. */
    public static final int DEFAULT_TURNS = 8;

    private static final int MIN_ITERATIONS = 100;

    public TeamAnalysis analyze(Team team, int turns, int iterations, RandomGenerator random) {
        if (turns < 1) {
            throw new IllegalArgumentException("턴 수는 1 이상이어야 합니다.");
        }
        if (iterations < MIN_ITERATIONS) {
            throw new IllegalArgumentException("반복 횟수는 " + MIN_ITERATIONS + " 이상이어야 합니다.");
        }

        List<TeamSlot> slots = team.getSlots();
        List<General> generals = slots.stream().map(TeamSlot::getGeneral).toList();
        List<Tactic> equipped = collectTactics(slots);

        List<TeamAnalysis.Finding> findings = new ArrayList<>();

        TeamAnalysis.RosterAnalysis roster = analyzeRoster(generals, findings);
        TeamAnalysis.FactionAnalysis faction = analyzeFaction(generals, findings);
        TeamAnalysis.UnitTypeAnalysis unitType = analyzeUnitType(generals, findings);
        TeamAnalysis.TacticAnalysis tacticAnalysis = analyzeTactics(slots, equipped, findings);
        TeamAnalysis.SimulationSummary simulation =
                simulate(equipped, turns, iterations, random, findings);

        if (slots.isEmpty()) {
            findings.add(TeamAnalysis.Finding.error("EMPTY_TEAM", "부대에 장수가 한 명도 없습니다."));
        }

        Scored scored = score(roster, faction, tacticAnalysis, simulation, unitType);
        String confidence = confidence(scored.coverage());
        if (!"HIGH".equals(confidence)) {
            findings.add(TeamAnalysis.Finding.warn("SCORE_LOW_CONFIDENCE",
                    ("점수는 채점 항목의 %.0f%% 만 평가한 결과입니다. 미입력 데이터가 많아 "
                            + "편성의 우열보다 데이터 입력 상태를 더 반영합니다.")
                            .formatted(scored.coverage())));
        }

        return new TeamAnalysis(team.getId(), team.getName(), scored.score(), grade(scored.score()),
                round(scored.coverage(), 1), confidence,
                roster, faction, unitType, tacticAnalysis, simulation, sortFindings(findings));
    }

    /** 점수와, 그 점수가 채점 모델의 몇 %를 실제로 평가한 것인지. */
    private record Scored(int score, double coverage) {
    }

    // ---------------------------------------------------------------
    // 편성 구성
    // ---------------------------------------------------------------

    private TeamAnalysis.RosterAnalysis analyzeRoster(List<General> generals,
            List<TeamAnalysis.Finding> findings) {
        if (generals.size() < Team.MAX_SLOTS) {
            findings.add(TeamAnalysis.Finding.info("SLOT_EMPTY",
                    "장수 자리가 %d칸 비어 있습니다.".formatted(Team.MAX_SLOTS - generals.size())));
        }
        return new TeamAnalysis.RosterAnalysis(generals.size(), Team.MAX_SLOTS);
    }

    // ---------------------------------------------------------------
    // 세력
    // ---------------------------------------------------------------

    private TeamAnalysis.FactionAnalysis analyzeFaction(List<General> generals,
            List<TeamAnalysis.Finding> findings) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (General g : generals) {
            Faction f = g.getFaction();
            counts.merge(f.label(), 1, Integer::sum);
        }

        String dominant = null;
        int dominantCount = 0;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > dominantCount) {
                dominant = e.getKey();
                dominantCount = e.getValue();
            }
        }

        String tier;
        String note;
        if (generals.isEmpty()) {
            tier = "NONE";
            note = "장수가 없습니다.";
        } else if (dominantCount == generals.size() && generals.size() >= 2) {
            tier = "PURE";
            note = "%s 단일 세력입니다. 동세력 보너스를 온전히 받습니다.".formatted(dominant);
        } else if (dominantCount >= 2) {
            tier = "PAIR";
            note = "%s %d명 + 타 세력 %d명 구성입니다."
                    .formatted(dominant, dominantCount, generals.size() - dominantCount);
            findings.add(TeamAnalysis.Finding.warn("FACTION_MIXED",
                    "세력이 섞여 있어 동세력 보너스가 줄어듭니다. " + note));
        } else {
            tier = "SCATTERED";
            note = "장수 전원의 세력이 다릅니다.";
            findings.add(TeamAnalysis.Finding.warn("FACTION_SCATTERED",
                    "세력이 모두 달라 동세력 보너스를 받지 못합니다."));
        }

        return new TeamAnalysis.FactionAnalysis(counts, dominant, dominantCount, tier, note);
    }

    // ---------------------------------------------------------------
    // 병종
    // ---------------------------------------------------------------

    private TeamAnalysis.UnitTypeAnalysis analyzeUnitType(List<General> generals,
            List<TeamAnalysis.Finding> findings) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        int unknown = 0;
        for (General g : generals) {
            UnitType t = g.getUnitType();
            if (t == null) {
                unknown++;
            } else {
                counts.merge(t.label(), 1, Integer::sum);
            }
        }

        boolean uniform = unknown == 0 && counts.size() == 1 && !generals.isEmpty();
        String note;
        if (unknown > 0) {
            note = "병종 미입력 %d명. 카드 이미지 아이콘으로는 판독이 불가해 비워둔 값입니다.".formatted(unknown);
            findings.add(TeamAnalysis.Finding.warn("UNIT_TYPE_MISSING",
                    ("장수 %d명의 병종이 비어 있어 병종 분석을 신뢰할 수 없습니다. "
                            + "CSV 임포트나 PATCH /api/generals/{id} 로 채워주세요.").formatted(unknown)));
        } else if (uniform) {
            note = "단일 병종 편성입니다.";
        } else {
            note = "혼성 병종 편성입니다.";
        }

        return new TeamAnalysis.UnitTypeAnalysis(counts, unknown, uniform, note);
    }

    // ---------------------------------------------------------------
    // 전법
    // ---------------------------------------------------------------

    private List<Tactic> collectTactics(List<TeamSlot> slots) {
        List<Tactic> result = new ArrayList<>();
        for (TeamSlot slot : slots) {
            General g = slot.getGeneral();
            if (g.getSignatureTactic() != null) {
                result.add(g.getSignatureTactic());
            }
            for (TeamSlotTactic st : slot.getTactics()) {
                result.add(st.getTactic());
            }
        }
        return result;
    }

    private TeamAnalysis.TacticAnalysis analyzeTactics(List<TeamSlot> slots, List<Tactic> tactics,
            List<TeamAnalysis.Finding> findings) {
        Map<String, Integer> byCategory = new LinkedHashMap<>();
        Map<String, Integer> byAbility = new LinkedHashMap<>();
        Map<String, Integer> byQuality = new LinkedHashMap<>();
        Map<String, Integer> nameCounts = new LinkedHashMap<>();

        double rateSum = 0;
        int rateCount = 0;
        int complete = 0;
        List<String> missing = new ArrayList<>();

        for (Tactic t : tactics) {
            nameCounts.merge(t.getName(), 1, Integer::sum);
            if (t.getCategory() != null) {
                byCategory.merge(t.getCategory().label(), 1, Integer::sum);
            }
            if (t.getAbilityType() != null) {
                byAbility.merge(t.getAbilityType().label(), 1, Integer::sum);
            }
            if (t.getQuality() != null) {
                byQuality.merge(t.getQuality().label(), 1, Integer::sum);
            }
            if (t.getTriggerRate() != null) {
                rateSum += t.getTriggerRate().doubleValue();
                rateCount++;
            }
            if (t.perTurnTriggerProbability() != null) {
                complete++;
            } else {
                missing.add(t.getName());
            }
        }

        List<String> duplicates = nameCounts.entrySet().stream()
                .filter(e -> e.getValue() > 1)
                .map(Map.Entry::getKey)
                .sorted()
                .toList();
        if (!duplicates.isEmpty()) {
            findings.add(TeamAnalysis.Finding.warn("TACTIC_DUPLICATE",
                    "같은 전법이 중복 장착되어 있습니다: " + String.join(", ", duplicates)));
        }

        int capacity = slots.size() * TeamSlot.MAX_TACTICS;
        int equippedOnly = slots.stream().mapToInt(s -> s.getTactics().size()).sum();
        if (equippedOnly < capacity) {
            findings.add(TeamAnalysis.Finding.info("TACTIC_SLOT_EMPTY",
                    "전법 슬롯 %d칸 중 %d칸이 비어 있습니다.".formatted(capacity, capacity - equippedOnly)));
        }

        double completeness = tactics.isEmpty() ? 0.0 : complete * 100.0 / tactics.size();
        if (!tactics.isEmpty() && complete < tactics.size()) {
            findings.add(TeamAnalysis.Finding.warn("TACTIC_DATA_MISSING",
                    "전법 %d개 중 %d개의 분류/발동확률이 비어 있어 시뮬레이션에서 제외했습니다."
                            .formatted(tactics.size(), tactics.size() - complete)));
        }

        Double avgRate = rateCount == 0 ? null : round(rateSum / rateCount, 2);
        return new TeamAnalysis.TacticAnalysis(tactics.size(), capacity, byCategory, byAbility,
                byQuality, avgRate, round(completeness, 1), duplicates,
                missing.stream().sorted().toList());
    }

    // ---------------------------------------------------------------
    // 몬테카를로 발동 시뮬레이션
    // ---------------------------------------------------------------

    private TeamAnalysis.SimulationSummary simulate(List<Tactic> tactics, int turns, int iterations,
            RandomGenerator random, List<TeamAnalysis.Finding> findings) {
        List<Tactic> evaluable = tactics.stream()
                .filter(t -> t.perTurnTriggerProbability() != null)
                .toList();
        int skipped = tactics.size() - evaluable.size();

        if (evaluable.isEmpty()) {
            findings.add(TeamAnalysis.Finding.warn("SIM_NO_DATA",
                    "발동확률이 입력된 전법이 없어 시뮬레이션을 수행하지 못했습니다."));
            return new TeamAnalysis.SimulationSummary(turns, 0, 0, skipped,
                    0.0, 0.0, Map.of(), Map.of());
        }

        double[] probs = evaluable.stream()
                .mapToDouble(t -> t.perTurnTriggerProbability())
                .toArray();

        long totalActivations = 0;
        long turnsWithAny = 0;
        long[] histogram = new long[probs.length + 1];
        long[] perTactic = new long[probs.length];

        for (int i = 0; i < iterations; i++) {
            for (int turn = 0; turn < turns; turn++) {
                int activatedThisTurn = 0;
                for (int t = 0; t < probs.length; t++) {
                    if (random.nextDouble() < probs[t]) {
                        activatedThisTurn++;
                        perTactic[t]++;
                    }
                }
                histogram[activatedThisTurn]++;
                totalActivations += activatedThisTurn;
                if (activatedThisTurn > 0) {
                    turnsWithAny++;
                }
            }
        }

        long totalTurns = (long) iterations * turns;
        Map<Integer, Double> histo = new TreeMap<>();
        for (int k = 0; k < histogram.length; k++) {
            if (histogram[k] > 0) {
                histo.put(k, round(histogram[k] * 1.0 / totalTurns, 4));
            }
        }

        Map<String, Double> perTacticExpected = new LinkedHashMap<>();
        for (int t = 0; t < probs.length; t++) {
            perTacticExpected.put(evaluable.get(t).getName(),
                    round(perTactic[t] * 1.0 / iterations, 3));
        }

        return new TeamAnalysis.SimulationSummary(turns, iterations, evaluable.size(), skipped,
                round(totalActivations * 1.0 / totalTurns, 4),
                round(turnsWithAny * 1.0 / totalTurns, 4),
                histo, perTacticExpected);
    }

    // ---------------------------------------------------------------
    // 점수
    // ---------------------------------------------------------------

    /** 채점 모델의 만점. 항목별 배점 합계이며 coverage 계산의 분모다. */
    private static final double FULL_WEIGHT = 100;

    /**
     * 0~100 점. 데이터가 비어 있으면 해당 항목은 채점하지 않고 만점 대비 비중을 줄인다.
     * 미입력을 0점으로 처리하면 "데이터를 안 넣어서 낮은 점수"와 "실제로 나쁜 편성"이 구분되지 않는다.
     *
     * <p>대신 실제로 평가한 배점 비중(coverage)을 함께 돌려준다. 이것이 없으면 데이터가 없을수록
     * 점수가 높아지는 착시가 생긴다.
     */
    private Scored score(TeamAnalysis.RosterAnalysis roster, TeamAnalysis.FactionAnalysis faction,
            TeamAnalysis.TacticAnalysis tactics, TeamAnalysis.SimulationSummary simulation,
            TeamAnalysis.UnitTypeAnalysis unitType) {
        double earned = 0;
        double possible = 0;

        // 편성 충실도 (35점) - 항상 채점 가능
        //
        // 예전에는 이 35점 중 17점을 «코스트 상한을 넘지 않았는가» 로 줬다.
        // 그런데 이 게임에는 코스트가 없다. 게다가 모든 장수가 같은 값이라 초과가
        // 일어날 수 없어서, 사실상 «모두에게 주는 17점» 이었다. 없는 개념에 주는 점수라
        // 걷어내고 자리를 채운 비율에 전부 싣는다.
        possible += 35;
        double fill = roster.generalCount() / (double) Team.MAX_SLOTS;
        earned += 35 * fill;

        // 세력 응집도 (25점) - 항상 채점 가능
        possible += 25;
        earned += switch (faction.tier()) {
            case "PURE" -> 25;
            case "PAIR" -> 14;
            case "SCATTERED" -> 5;
            default -> 0;
        };

        // 전법 슬롯 활용 (15점) - 항상 채점 가능
        possible += 15;
        if (tactics.slotCapacity() > 0) {
            double used = Math.min(1.0, tactics.equippedCount() / (double) tactics.slotCapacity());
            earned += 15 * used;
        }

        // 전법 발동력 (15점) - 발동확률 데이터가 있을 때만 채점
        if (simulation.evaluatedTactics() > 0) {
            possible += 15;
            earned += 15 * Math.min(1.0, simulation.probAtLeastOne());
        }

        // 병종 일관성 (10점) - 병종이 전부 입력됐을 때만 채점
        if (unitType.unknownCount() == 0 && roster.generalCount() > 0) {
            possible += 10;
            earned += unitType.uniform() ? 10 : 5;
        }

        int score = possible == 0 ? 0 : (int) Math.round(earned / possible * 100);
        return new Scored(score, possible / FULL_WEIGHT * 100);
    }

    /** coverage 가 낮을수록 점수를 편성 평가로 읽으면 안 된다. */
    private String confidence(double coverage) {
        if (coverage >= 95) {
            return "HIGH";
        }
        if (coverage >= 80) {
            return "MEDIUM";
        }
        return "LOW";
    }

    private String grade(int score) {
        if (score >= 90) {
            return "S";
        }
        if (score >= 80) {
            return "A";
        }
        if (score >= 70) {
            return "B";
        }
        if (score >= 55) {
            return "C";
        }
        return "D";
    }

    private List<TeamAnalysis.Finding> sortFindings(List<TeamAnalysis.Finding> findings) {
        Map<String, Integer> order = Map.of("ERROR", 0, "WARN", 1, "INFO", 2);
        return findings.stream()
                .sorted(Comparator.comparingInt(f -> order.getOrDefault(f.severity(), 9)))
                .toList();
    }

    private static double round(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }
}
