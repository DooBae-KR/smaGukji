package com.smagukji.backend.service;

import com.smagukji.backend.domain.AbilityType;
import com.smagukji.backend.domain.Camp;
import com.smagukji.backend.domain.Disposition;
import com.smagukji.backend.domain.General;
import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.TacticCategory;
import com.smagukji.backend.domain.TacticQuality;
import com.smagukji.backend.domain.TacticSource;
import com.smagukji.backend.domain.UnitType;
import com.smagukji.backend.repository.GeneralRepository;
import com.smagukji.backend.repository.TacticRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 장수/전법 상세 데이터를 CSV 로 일괄 입력한다.
 *
 * <p>이름(name)으로 기존 행을 찾아 갱신만 한다. 새 이름은 만들지 않는다. 마스터 목록은 카드
 * 이미지에서 생성한 시드가 정답이고, 오타난 이름으로 유령 행이 생기면 이미지 연결이 끊기기 때문이다.
 *
 * <p>한글 값도 받는다. 예를 들어 category 에 {@code 액티브} 를 써도 {@code ACTIVE} 로 해석한다.
 */
@Service
public class MasterDataImportService {

    private static final Logger log = LoggerFactory.getLogger(MasterDataImportService.class);

    private final GeneralRepository generalRepository;
    private final TacticRepository tacticRepository;

    public MasterDataImportService(GeneralRepository generalRepository,
            TacticRepository tacticRepository) {
        this.generalRepository = generalRepository;
        this.tacticRepository = tacticRepository;
    }

    /**
     * 임포트 결과.
     *
     * @param updated  갱신된 행 수
     * @param skipped  변경할 값이 없어 건너뛴 행 수
     * @param notFound 마스터에 없는 이름 목록
     * @param errors   행 단위 오류
     */
    public record ImportReport(int updated, int skipped, List<String> notFound, List<String> errors) {
    }

    // ---------------------------------------------------------------
    // 전법
    // ---------------------------------------------------------------

    /** 헤더: name,category,abilityType,quality,triggerRate,targetCount,source,roleTags,effectText */
    @Transactional
    public ImportReport importTactics(String csv) {
        List<Map<String, String>> rows = CsvReader.parse(csv);
        int updated = 0;
        int skipped = 0;
        List<String> notFound = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (Map<String, String> row : rows) {
            String name = row.get("name");
            if (name == null || name.isBlank()) {
                errors.add("name 이 비어 있는 행을 건너뛰었습니다.");
                continue;
            }

            Optional<Tactic> found = tacticRepository.findByName(name.trim());
            if (found.isEmpty()) {
                notFound.add(name.trim());
                continue;
            }

            Tactic tactic = found.get();
            try {
                boolean changed = false;
                changed |= set(row, "category", v -> tactic.setCategory(parseCategory(v)));
                changed |= set(row, "abilityType", v -> tactic.setAbilityType(parseAbilityType(v)));
                changed |= set(row, "quality", v -> tactic.setQuality(parseQuality(v)));
                changed |= set(row, "triggerRate", v -> tactic.setTriggerRate(parseRate(v)));
                changed |= set(row, "targetCount", v -> tactic.setTargetCount(Integer.valueOf(v.trim())));
                changed |= set(row, "source", v -> tactic.setSource(parseSource(v)));
                changed |= set(row, "effectText", tactic::setEffectText);
                changed |= set(row, "roleTags", v -> tactic.setRoleTags(splitTags(v)));

                if (changed) {
                    tacticRepository.save(tactic);
                    updated++;
                } else {
                    skipped++;
                }
            } catch (RuntimeException e) {
                errors.add("%s: %s".formatted(name, e.getMessage()));
            }
        }

        log.info("전법 임포트 - 갱신 {}, 건너뜀 {}, 미발견 {}, 오류 {}",
                updated, skipped, notFound.size(), errors.size());
        return new ImportReport(updated, skipped, notFound, errors);
    }

    // ---------------------------------------------------------------
    // 장수
    // ---------------------------------------------------------------

    /**
     * 헤더: name,unitType,camp,dispositions,might,intellect,leadership,initiative,
     *      statLevel,signatureTacticName,note
     *
     * <p>dispositions 는 복수라 {@code |} 또는 {@code ;} 로 구분한다. 예: {@code 방어|병기}
     */
    @Transactional
    public ImportReport importGenerals(String csv) {
        List<Map<String, String>> rows = CsvReader.parse(csv);
        int updated = 0;
        int skipped = 0;
        List<String> notFound = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (Map<String, String> row : rows) {
            String name = row.get("name");
            if (name == null || name.isBlank()) {
                errors.add("name 이 비어 있는 행을 건너뛰었습니다.");
                continue;
            }

            Optional<General> found = generalRepository.findByName(name.trim());
            if (found.isEmpty()) {
                notFound.add(name.trim());
                continue;
            }

            General general = found.get();
            try {
                boolean changed = false;
                changed |= set(row, "unitType", v -> general.setUnitType(parseUnitType(v)));
                changed |= set(row, "camp", v -> general.setCamp(parseCamp(v)));
                changed |= set(row, "dispositions",
                        v -> general.setDispositions(parseDispositions(v)));
                changed |= set(row, "might", v -> general.setMight(new BigDecimal(v.trim())));
                changed |= set(row, "intellect",
                        v -> general.setIntellect(new BigDecimal(v.trim())));
                changed |= set(row, "leadership",
                        v -> general.setLeadership(new BigDecimal(v.trim())));
                changed |= set(row, "initiative",
                        v -> general.setInitiative(new BigDecimal(v.trim())));
                changed |= set(row, "statLevel",
                        v -> general.setStatLevel(Integer.parseInt(v.trim())));
                changed |= set(row, "note", general::setNote);
                changed |= set(row, "signatureTacticName", v -> general.setSignatureTactic(
                        tacticRepository.findByName(v.trim()).orElseThrow(
                                () -> new IllegalArgumentException("전법을 찾을 수 없습니다: " + v))));

                if (changed) {
                    generalRepository.save(general);
                    updated++;
                } else {
                    skipped++;
                }
            } catch (RuntimeException e) {
                errors.add("%s: %s".formatted(name, e.getMessage()));
            }
        }

        log.info("장수 임포트 - 갱신 {}, 건너뜀 {}, 미발견 {}, 오류 {}",
                updated, skipped, notFound.size(), errors.size());
        return new ImportReport(updated, skipped, notFound, errors);
    }

    // ---------------------------------------------------------------
    // 파싱 헬퍼
    // ---------------------------------------------------------------

    /** 값이 비어 있지 않을 때만 setter 를 호출한다. 빈 칸은 "변경 없음"을 뜻한다. */
    private static boolean set(Map<String, String> row, String key, java.util.function.Consumer<String> setter) {
        String value = row.get(key);
        if (value == null || value.isBlank()) {
            return false;
        }
        setter.accept(value);
        return true;
    }

    private static String[] splitTags(String value) {
        return java.util.Arrays.stream(value.split("[|;]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
    }

    private static BigDecimal parseRate(String value) {
        String cleaned = value.trim().replace("%", "");
        BigDecimal rate = new BigDecimal(cleaned);
        if (rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("발동확률은 0~100 이어야 합니다: " + value);
        }
        return rate;
    }

    private static TacticCategory parseCategory(String value) {
        return switch (value.trim()) {
            case "패시브" -> TacticCategory.PASSIVE;
            case "액티브" -> TacticCategory.ACTIVE;
            case "지휘" -> TacticCategory.COMMAND;
            case "추격" -> TacticCategory.PURSUIT;
            case "돌격" -> TacticCategory.ASSAULT;
            case "진법" -> TacticCategory.FORMATION;
            case "내정" -> TacticCategory.INTERNAL;
            default -> TacticCategory.valueOf(value.trim().toUpperCase(Locale.ROOT));
        };
    }

    private static AbilityType parseAbilityType(String value) {
        return switch (value.trim()) {
            case "치유" -> AbilityType.HEAL;
            case "병기" -> AbilityType.WEAPON;
            case "책략" -> AbilityType.STRATEGY;
            case "방어" -> AbilityType.DEFENSE;
            case "보조" -> AbilityType.SUPPORT;
            case "제어" -> AbilityType.CONTROL;
            default -> AbilityType.valueOf(value.trim().toUpperCase(Locale.ROOT));
        };
    }

    private static TacticQuality parseQuality(String value) {
        return switch (value.trim()) {
            case "황금", "금" -> TacticQuality.GOLD;
            case "보라", "자주" -> TacticQuality.PURPLE;
            case "파랑", "청" -> TacticQuality.BLUE;
            case "초록", "녹" -> TacticQuality.GREEN;
            default -> TacticQuality.valueOf(value.trim().toUpperCase(Locale.ROOT));
        };
    }

    private static TacticSource parseSource(String value) {
        return switch (value.trim()) {
            case "고유" -> TacticSource.SIGNATURE;
            case "전수" -> TacticSource.INHERITED;
            case "이벤트" -> TacticSource.EVENT;
            case "기본" -> TacticSource.BASIC;
            default -> TacticSource.valueOf(value.trim().toUpperCase(Locale.ROOT));
        };
    }

    private static UnitType parseUnitType(String value) {
        return switch (value.trim()) {
            case "방패병" -> UnitType.SHIELD;
            case "창병" -> UnitType.SPEAR;
            case "궁병" -> UnitType.BOW;
            case "기병" -> UnitType.CAVALRY;
            default -> UnitType.valueOf(value.trim().toUpperCase(Locale.ROOT));
        };
    }

    private static Camp parseCamp(String value) {
        return switch (value.trim()) {
            case "전열" -> Camp.FRONT;
            case "균형" -> Camp.BALANCE;
            case "후열" -> Camp.BACK;
            default -> Camp.valueOf(value.trim().toUpperCase(Locale.ROOT));
        };
    }

    /** 성향은 복수다. 파이프나 세미콜론으로 구분한다. 예: 방어|병기 */
    private static String[] parseDispositions(String value) {
        return Arrays.stream(value.split("[|;]"))
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                .map(MasterDataImportService::parseDisposition)
                .map(Enum::name)
                .toArray(String[]::new);
    }

    private static Disposition parseDisposition(String value) {
        return switch (value.trim()) {
            case "치유" -> Disposition.HEAL;
            case "보조" -> Disposition.SUPPORT;
            case "방어" -> Disposition.DEFENSE;
            case "보조방어" -> Disposition.SUPPORT_DEFENSE;
            case "문무보조" -> Disposition.CIVIL_MARTIAL_SUPPORT;
            case "책략" -> Disposition.STRATEGY;
            case "병기" -> Disposition.WEAPON;
            default -> Disposition.valueOf(value.trim().toUpperCase(Locale.ROOT));
        };
    }
}
