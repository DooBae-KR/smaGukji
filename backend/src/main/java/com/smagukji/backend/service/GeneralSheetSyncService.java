package com.smagukji.backend.service;

import com.smagukji.backend.domain.AbilityType;
import com.smagukji.backend.domain.Camp;
import com.smagukji.backend.domain.Disposition;
import com.smagukji.backend.domain.General;
import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.TacticCategory;
import com.smagukji.backend.domain.TacticSource;
import com.smagukji.backend.domain.UnitType;
import com.smagukji.backend.repository.GeneralRepository;
import com.smagukji.backend.repository.TacticRepository;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 장수 분류를 스프레드시트에서 다시 읽어 반영한다.
 *
 * <p>시트는 계속 편집되므로 마이그레이션에 스냅샷을 구우면 안 된다. 실제로 V13 은 편집
 * 중간 상태를 찍는 바람에 사라진 장수의 수치가 DB 에 남았다. 그래서 «언제든 다시 돌릴 수
 * 있는» 동기화로 옮겼다.
 *
 * <p>원칙
 * <ul>
 *   <li>이름이 이미 있는 장수만 갱신한다. 시트에만 있는 이름으로 장수를 만들지 않는다.
 *       카드 이미지가 없는 유령 장수가 생기기 때문이다.</li>
 *   <li>매핑표에 없는 분류 값이 나오면 그 행을 건너뛰고 보고한다. 추측하지 않는다.</li>
 * </ul>
 */
@Service
public class GeneralSheetSyncService {

    private static final Logger log = LoggerFactory.getLogger(GeneralSheetSyncService.class);

    private static final Map<String, Camp> CAMP = Map.of(
            "전열", Camp.FRONT, "균형", Camp.BALANCE, "후열", Camp.BACK);

    // 보조방어·문무보조는 시트에 한 덩어리로 적혀 있어 분해하지 않는다.
    private static final Map<String, Disposition> DISPOSITION = Map.of(
            "치유", Disposition.HEAL,
            "보조", Disposition.SUPPORT,
            "방어", Disposition.DEFENSE,
            "보조방어", Disposition.SUPPORT_DEFENSE,
            "문무", Disposition.CIVIL_MARTIAL,
            "문무보조", Disposition.CIVIL_MARTIAL_SUPPORT,
            "책략", Disposition.STRATEGY,
            "병기", Disposition.WEAPON);

    private static final Map<String, UnitType> UNIT = Map.of(
            "방패병", UnitType.SHIELD, "창병", UnitType.SPEAR,
            "궁병", UnitType.BOW, "기병", UnitType.CAVALRY);

    private static final Map<String, TacticCategory> CATEGORY = Map.of(
            "지휘", TacticCategory.COMMAND,
            "액티브", TacticCategory.ACTIVE,
            "패시브", TacticCategory.PASSIVE,
            "추격", TacticCategory.PURSUIT,
            "돌격", TacticCategory.ASSAULT,
            "진법", TacticCategory.FORMATION,
            "내정", TacticCategory.INTERNAL);

    private static final Map<String, AbilityType> ABILITY = Map.of(
            "치유", AbilityType.HEAL, "보조", AbilityType.SUPPORT,
            "책략", AbilityType.STRATEGY, "병기", AbilityType.WEAPON,
            "방어", AbilityType.DEFENSE, "문무", AbilityType.CIVIL_MARTIAL,
            "제어", AbilityType.CONTROL);

    private static final Map<String, com.smagukji.backend.domain.Faction> FACTION = Map.of(
            "위", com.smagukji.backend.domain.Faction.WEI,
            "촉", com.smagukji.backend.domain.Faction.SHU,
            "오", com.smagukji.backend.domain.Faction.WU,
            "군", com.smagukji.backend.domain.Faction.QUN,
            "한", com.smagukji.backend.domain.Faction.HAN);

    /**
     * 시트의 열 이름. 번호가 아니라 «머리글» 로 찾는다.
     *
     * <p>예전에는 열 번호를 그대로 박아뒀는데, 시트에 «나라» 열이 하나 끼어들자 그 뒤가
     * 전부 한 칸씩 밀렸다. 그 상태로 동기화를 돌리면 진영 칸에 나라가, 성향 칸에 진영이
     * 들어간다. 조용히 틀린 값이 박히는 것이라 알아채기도 어렵다.
     * 그래서 열이 늘거나 순서가 바뀌어도 따라가도록 머리글로 찾는다.
     */
    private static final String H_SEASON = "시즌";
    private static final String H_FACTION = "나라";
    private static final String H_CAMP = "무장 진영";
    private static final String H_DISPOSITION = "무장 성향";
    private static final String H_NAME = "무장이름";
    private static final String H_UNIT = "무장 병종";
    private static final String H_CATEGORY = "전법 유명";
    private static final String H_ABILITY = "전법 특성";
    private static final String H_TACTIC = "고유전법이름";
    private static final String H_RATE = "발동 확률";
    private static final String H_EFFECT = "전법 설명";
    private static final String H_MIGHT = "무력";
    private static final String H_INTELLECT = "지력";
    private static final String H_LEADERSHIP = "통솔";
    private static final String H_INITIATIVE = "선공";

    // 마스터 목록 시트(구분/이름/이미지)의 열 위치
    private static final int COL_ROSTER_KIND = 0;
    private static final int COL_ROSTER_NAME = 1;

    private final GeneralRepository generalRepository;
    private final TacticRepository tacticRepository;
    private final String sheetUrl;
    private final String rosterUrl;

    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public GeneralSheetSyncService(GeneralRepository generalRepository,
            TacticRepository tacticRepository,
            @Value("${app.sheet.general-csv-url:}") String sheetUrl,
            @Value("${app.sheet.roster-csv-url:}") String rosterUrl) {
        this.generalRepository = generalRepository;
        this.tacticRepository = tacticRepository;
        this.sheetUrl = sheetUrl;
        this.rosterUrl = rosterUrl;
    }

    /**
     * 동기화 결과.
     *
     * @param updated   갱신된 장수
     * @param notFound  시트에는 있으나 장수 명단에 없는 이름
     * @param skipped   매핑표에 없는 값이 있어 건너뛴 행
     */
    public record SyncResult(int sheetRows, int updated, List<String> notFound,
            List<String> skipped) {
    }

    @Transactional
    public SyncResult sync() throws IOException, InterruptedException {
        if (sheetUrl == null || sheetUrl.isBlank()) {
            throw new IllegalStateException(
                    "app.sheet.general-csv-url (환경변수 GENERAL_SHEET_CSV_URL) 이 설정되지 않았습니다.");
        }

        HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(sheetUrl))
                        .timeout(Duration.ofSeconds(30))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() != 200) {
            throw new IllegalStateException(
                    "시트를 받지 못했습니다 (HTTP %d). 공개 설정을 확인하세요.".formatted(res.statusCode()));
        }

        List<List<String>> rows = CsvReader.parseRows(res.body());
        SheetColumns col = SheetColumns.of(rows);
        int sheetRows = 0;
        int updated = 0;
        List<String> notFound = new ArrayList<>();
        List<String> skipped = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            String name = cell(row, col.require(H_NAME));
            if (name.isEmpty() || "#N/A".equals(name)) {
                continue;                       // 빈 템플릿 행
            }
            sheetRows++;

            Optional<General> found = generalRepository.findByName(name);
            if (found.isEmpty()) {
                notFound.add(name);
                continue;
            }

            // ⚠️ 값을 «전부» 해석한 뒤에 반영한다.
            // 예전에는 세터를 부르면서 중간에 예외가 나서, 건너뛴 행인데도 진영만 들어가고
            // 수치는 빈 «반쯤 갱신된» 상태가 남았다.
            com.smagukji.backend.domain.Faction faction;
            Camp camp;
            String[] dispositions;
            UnitType unit;
            TacticCategory category;
            AbilityType ability;
            try {
                faction = lookup(FACTION, cell(row, col.require(H_FACTION)), "나라");
                camp = lookup(CAMP, cell(row, col.require(H_CAMP)), "진영");
                dispositions = parseDispositions(cell(row, col.require(H_DISPOSITION)));
                unit = lookup(UNIT, cell(row, col.require(H_UNIT)), "병종");
                category = lookup(CATEGORY, cell(row, col.require(H_CATEGORY)), "전법 유명");
                ability = lookup(ABILITY, cell(row, col.require(H_ABILITY)), "전법 특성");
            } catch (IllegalArgumentException e) {
                skipped.add("%s: %s".formatted(name, e.getMessage()));
                continue;
            }

            General g = found.get();
            g.setFaction(faction);
            g.setCamp(camp);
            g.setDispositions(dispositions);
            g.setUnitType(unit);
            g.setMight(decimal(cell(row, col.require(H_MIGHT))));
            g.setIntellect(decimal(cell(row, col.require(H_INTELLECT))));
            g.setLeadership(decimal(cell(row, col.require(H_LEADERSHIP))));
            g.setInitiative(decimal(cell(row, col.require(H_INITIATIVE))));
            g.setStatLevel(50);

            // 시즌은 비어 있을 수 있다(시즌 구분이 없는 기본 장수).
            Integer season = intOrNull(cell(row, col.optional(H_SEASON)));
            if (season != null) {
                g.setSeason(season == 1 ? null : season);
            }

            String tacticName = cell(row, col.require(H_TACTIC));
            if (!tacticName.isEmpty()) {
                g.setSignatureTactic(upsertSignatureTactic(
                        cell(row, col.require(H_RATE)), cell(row, col.require(H_EFFECT)),
                        tacticName, category, ability));
            }
            generalRepository.save(g);
            updated++;
        }

        log.info("장수 시트 동기화 - 시트 {}행, 갱신 {}, 명단없음 {}, 건너뜀 {}",
                sheetRows, updated, notFound.size(), skipped.size());
        return new SyncResult(sheetRows, updated, notFound, skipped);
    }

    private Tactic upsertSignatureTactic(String rawRate, String effect, String tacticName,
            TacticCategory category, AbilityType ability) {
        Tactic tactic = tacticRepository.findByName(tacticName)
                .orElseGet(() -> tacticRepository.save(new Tactic(tacticName)));

        tactic.setCategory(category);
        tactic.setAbilityType(ability);
        tactic.setTriggerRate(percent(rawRate));
        if (!effect.isEmpty()) {
            tactic.setEffectText(effect);
        }
        tactic.setSource(TacticSource.SIGNATURE);
        return tacticRepository.save(tactic);
    }

    /**
     * 발동 확률을 퍼센트 수치로 바꾼다.
     *
     * <p>시트가 이 값을 두 가지로 담고 있다. 백분율 서식이면 {@code 0.75} 처럼 «비율» 이
     * 내려오고, 사람이 직접 친 칸이면 {@code "75%"} 처럼 «글자» 가 내려온다.
     * 1 이하면 비율로 보고 100을 곱한다. 100% 를 1.0 으로 적는 칸이 실제로 있어서다.
     *
     * <p>형식이 깨진 값(예: {@code "100%%"})은 고쳐 넣지 않고 비운다.
     * 그럴듯하게 메우면 나중에 그것이 실제 값인지 알 수 없게 된다.
     */
    private static BigDecimal percent(String raw) {
        String v = raw.replace("%", "").trim();
        if (v.isEmpty() || raw.contains("%%")) {
            return null;
        }
        BigDecimal n = decimal(v);
        if (n == null) {
            return null;
        }
        return n.compareTo(BigDecimal.ONE) <= 0 ? n.multiply(new BigDecimal("100")) : n;
    }

    private static Integer intOrNull(String raw) {
        BigDecimal n = decimal(raw);
        return n == null ? null : n.intValue();
    }


    /** 성향은 복수다. 줄바꿈으로만 나눈다. */
    private static String[] parseDispositions(String raw) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String part : raw.split("[\\r\\n]+")) {
            String v = part.trim();
            if (v.isEmpty()) {
                continue;
            }
            Disposition d = DISPOSITION.get(v);
            if (d == null) {
                throw new IllegalArgumentException("알 수 없는 성향 \"%s\"".formatted(v));
            }
            out.add(d.name());
        }
        return out.toArray(new String[0]);
    }

    private static <T> T lookup(Map<String, T> table, String value, String label) {
        if (value.isEmpty()) {
            return null;
        }
        T v = table.get(value);
        if (v == null) {
            throw new IllegalArgumentException("알 수 없는 %s \"%s\"".formatted(label, value));
        }
        return v;
    }

    /** 없는 열(-1)이나 짧은 행은 빈 값으로 본다. 시트 끝의 빈 칸은 아예 오지 않는다. */
    private static String cell(List<String> row, int index) {
        return index >= 0 && index < row.size() ? row.get(index).trim() : "";
    }

    private static BigDecimal decimal(String value) {
        if (value.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(value.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ---------------------------------------------------------------
    // 마스터 목록 시트 (구분 / 이름 / 이미지)
    // ---------------------------------------------------------------

    /**
     * 이름 대조 결과.
     *
     * @param createdTactics  시트에만 있어 새로 만든 전법
     * @param missingGenerals 시트에만 있는 장수. 세력·코스트를 모르므로 만들지 않고 알리기만 한다
     * @param extraTactics    DB 에만 있는 전법(고유전법 등). 지우지 않는다
     * @param extraGenerals   DB 에만 있는 장수
     */
    public record RosterResult(int sheetGenerals, int sheetTactics,
            List<String> createdTactics, List<String> suspectedTypos,
            List<String> missingGenerals,
            List<String> extraTactics, List<String> extraGenerals) {
    }

    /**
     * 마스터 목록 시트와 DB 의 이름을 맞춘다.
     *
     * <p>전법은 이름만 있으면 성립하므로 없는 것을 만든다. 장수는 세력·코스트가 필수인데
     * 이 시트에 없으므로 만들지 않고 보고만 한다. 없는 값을 지어내면 카드 이미지도 없는
     * 유령 장수가 생긴다.
     *
     * <p>DB 에만 있는 항목은 지우지 않는다. 고유전법처럼 다른 경로로 들어온 정상 데이터이거나,
     * 시트 쪽 오타일 수 있기 때문이다.
     */
    @Transactional
    public RosterResult syncRoster() throws IOException, InterruptedException {
        if (rosterUrl == null || rosterUrl.isBlank()) {
            throw new IllegalStateException(
                    "app.sheet.roster-csv-url (환경변수 ROSTER_SHEET_CSV_URL) 이 설정되지 않았습니다.");
        }

        List<List<String>> rows = CsvReader.parseRows(fetch(rosterUrl));
        List<String> sheetGenerals = new ArrayList<>();
        List<String> sheetTactics = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            String kind = cell(row, COL_ROSTER_KIND);
            String name = cell(row, COL_ROSTER_NAME);
            if (name.isEmpty()) {
                continue;
            }
            if ("장수".equals(kind)) {
                sheetGenerals.add(name);
            } else if ("전법".equals(kind)) {
                sheetTactics.add(name);
            }
        }

        // 새 전법을 만들기 전에 «오타로 보이는 이름»을 걸러낸다.
        // 실제로 시트의 «결사닁 다짐»(오타)이 «결사의 다짐» 옆에 하나 더 생긴 적이 있다.
        // 한 글자만 다른 이름은 새 전법이 아니라 오타일 가능성이 훨씬 높다.
        List<String> existing = tacticRepository.findAll().stream().map(Tactic::getName).toList();

        List<String> created = new ArrayList<>();
        List<String> suspectedTypos = new ArrayList<>();
        for (String name : sheetTactics) {
            if (tacticRepository.findByName(name).isPresent()) {
                continue;
            }
            String near = nearDuplicate(name, existing);
            if (near != null) {
                suspectedTypos.add("\"%s\" ← \"%s\" 의 오타로 보여 만들지 않았습니다".formatted(name, near));
                continue;
            }
            tacticRepository.save(new Tactic(name));
            created.add(name);
        }

        List<String> missingGenerals = sheetGenerals.stream()
                .filter(n -> generalRepository.findByName(n).isEmpty())
                .toList();

        List<String> extraGenerals = generalRepository.findAll().stream()
                .map(General::getName)
                .filter(n -> !sheetGenerals.contains(n))
                .sorted()
                .toList();

        List<String> extraTactics = tacticRepository.findAll().stream()
                .map(Tactic::getName)
                .filter(n -> !sheetTactics.contains(n))
                .sorted()
                .toList();

        log.info("마스터 목록 대조 - 시트 장수 {} 전법 {} / 전법 신규 {} / 장수 누락 {}",
                sheetGenerals.size(), sheetTactics.size(), created.size(), missingGenerals.size());

        return new RosterResult(sheetGenerals.size(), sheetTactics.size(),
                created, suspectedTypos, missingGenerals, extraTactics, extraGenerals);
    }

    /**
     * 기존 이름 중 «한 글자만 다른» 것을 찾는다. 있으면 새 항목이 아니라 오타로 본다.
     *
     * @return 비슷한 기존 이름, 없으면 null
     */
    private static String nearDuplicate(String name, List<String> existing) {
        for (String other : existing) {
            if (other.length() == name.length() && differsByOneChar(name, other)) {
                return other;
            }
        }
        return null;
    }

    private static boolean differsByOneChar(String a, String b) {
        int diff = 0;
        for (int i = 0; i < a.length(); i++) {
            if (a.charAt(i) != b.charAt(i) && ++diff > 1) {
                return false;
            }
        }
        return diff == 1;
    }

    private String fetch(String url) throws IOException, InterruptedException {
        HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(30))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            throw new IllegalStateException(
                    "시트를 받지 못했습니다 (HTTP %d). 공개 설정을 확인하세요.".formatted(res.statusCode()));
        }
        return res.body();
    }
    /** 매핑표에 어떤 값이 있는지 화면에 보여주기 위한 목록. */
    public Map<String, List<String>> vocabulary() {
        return Map.of(
                "진영", List.copyOf(CAMP.keySet()),
                "성향", List.copyOf(DISPOSITION.keySet()),
                "병종", List.copyOf(UNIT.keySet()),
                "전법 유명", List.copyOf(CATEGORY.keySet()),
                "전법 특성", List.copyOf(ABILITY.keySet()));
    }

    static {
        // 매핑표에 중복 키가 있으면 Map.of 가 기동 시 터진다. 여기서 미리 확인해 둔다.
        Arrays.asList(CAMP, DISPOSITION, UNIT, CATEGORY, ABILITY).forEach(m -> {
            if (m.isEmpty()) {
                throw new IllegalStateException("매핑표가 비어 있습니다");
            }
        });
    }
}
