package com.smagukji.backend.service;

import com.smagukji.backend.domain.AbilityType;
import com.smagukji.backend.domain.Buff;
import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.TacticCategory;
import com.smagukji.backend.repository.BuffRepository;
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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 스프레드시트의 «전법»·«버프» 탭을 읽어 반영한다.
 *
 * <p>장수 쪽({@link GeneralSheetSyncService})과 나뉜 이유는 시트 탭이 다르기 때문이다.
 * 무장 탭에는 고유전법만 있고, 배워서 쓰는 전법 93개는 «전법» 탭에 따로 있다.
 *
 * <p>원칙은 장수 쪽과 같다.
 * <ul>
 *   <li>매핑표에 없는 값이 나오면 그 행을 건너뛰고 보고한다. 추측해서 채우지 않는다.</li>
 *   <li>열은 번호가 아니라 머리글로 찾는다({@link SheetColumns}). 열이 하나 끼어들어도
 *       조용히 틀린 값이 박히지 않게 하기 위해서다.</li>
 * </ul>
 */
@Service
public class TacticSheetSyncService {

    private static final Logger log = LoggerFactory.getLogger(TacticSheetSyncService.class);

    /**
     * 한글 라벨 → enum.
     *
     * <p>표를 손으로 또 적지 않고 enum 의 {@code label()} 에서 만든다.
     * 두 벌로 두면 enum 에 값을 추가했을 때 한쪽만 늘어나 조용히 어긋난다.
     */
    private static final Map<String, TacticCategory> CATEGORY = Arrays.stream(TacticCategory.values())
            .collect(Collectors.toMap(TacticCategory::label, Function.identity()));

    private static final Map<String, AbilityType> ABILITY = Arrays.stream(AbilityType.values())
            .collect(Collectors.toMap(AbilityType::label, Function.identity()));

    private static final Map<String, String> RARITY = Map.of("전설", "LEGEND", "영웅", "HERO");

    private static final Map<String, String> BUFF_CATEGORY = Map.of(
            "기능성 버프", "FUNCTIONAL",
            "기본 버프", "BASIC",
            "이상 상태", "AILMENT",
            "제어 상태", "CONTROL",
            "특수 피해", "SPECIAL_DAMAGE");

    // 전법 탭
    private static final String H_NAME = "전법 이름";
    private static final String H_CATEGORY = "전법 유형";
    private static final String H_ABILITY = "전법 특성";
    private static final String H_RATE = "발동률";
    private static final String H_EFFECT = "전법 설명";
    private static final String H_RARITY = "등급";
    private static final String H_SEASON = "시즌";

    // 버프 탭
    private static final String H_BUFF_CATEGORY = "버프";
    private static final String H_BUFF_NAME = "버프명";
    private static final String H_BUFF_DESC = "설명";

    private final TacticRepository tacticRepository;
    private final BuffRepository buffRepository;
    private final String tacticUrl;
    private final String buffUrl;

    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public TacticSheetSyncService(TacticRepository tacticRepository, BuffRepository buffRepository,
            @Value("${app.sheet.tactic-csv-url:}") String tacticUrl,
            @Value("${app.sheet.buff-csv-url:}") String buffUrl) {
        this.tacticRepository = tacticRepository;
        this.buffRepository = buffRepository;
        this.tacticUrl = tacticUrl;
        this.buffUrl = buffUrl;
    }

    /**
     * @param created 시트에만 있어 새로 만든 것
     * @param updated 이미 있어 값만 갱신한 것
     * @param skipped 알 수 없는 값이 있어 건너뛴 행
     */
    public record SheetResult(int sheetRows, int created, int updated, List<String> skipped) {
    }

    // ---------------------------------------------------------------
    // 전법
    // ---------------------------------------------------------------

    @Transactional
    public SheetResult syncTactics() throws IOException, InterruptedException {
        List<List<String>> rows = fetch(tacticUrl, "app.sheet.tactic-csv-url", "TACTIC_SHEET_CSV_URL");
        SheetColumns col = SheetColumns.of(rows);

        int sheetRows = 0;
        int created = 0;
        int updated = 0;
        List<String> skipped = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            String name = SheetColumns.cell(row, col.require(H_NAME));
            if (name.isEmpty() || "#N/A".equals(name)) {
                continue;
            }
            sheetRows++;

            // 값을 «전부» 해석한 뒤에 반영한다. 중간에 실패하면 반쯤 갱신된 행이 남는다.
            TacticCategory category;
            AbilityType ability;
            String rarity;
            try {
                category = lookup(CATEGORY, SheetColumns.cell(row, col.require(H_CATEGORY)), "전법 유형");
                ability = lookup(ABILITY, SheetColumns.cell(row, col.require(H_ABILITY)), "전법 특성");
                rarity = lookup(RARITY, SheetColumns.cell(row, col.require(H_RARITY)), "등급");
            } catch (IllegalArgumentException e) {
                skipped.add("%s: %s".formatted(name, e.getMessage()));
                continue;
            }

            var existing = tacticRepository.findByName(name);
            Tactic t = existing.orElseGet(() -> new Tactic(name));
            boolean isNew = existing.isEmpty();

            t.setCategory(category);
            t.setAbilityType(ability);
            t.setRarity(rarity);
            t.setTriggerRate(percent(SheetColumns.cell(row, col.require(H_RATE))));

            String effect = SheetColumns.cell(row, col.require(H_EFFECT));
            if (!effect.isEmpty()) {
                t.setEffectText(effect);
            }

            // 시즌 1 은 «시즌 구분 없음» 이라 비워둔다. 카드에 S 표시가 붙는 것만 번호를 갖는다.
            Integer season = intOrNull(SheetColumns.cell(row, col.optional(H_SEASON)));
            t.setSeason(season == null || season == 1 ? null : season);

            tacticRepository.save(t);
            if (isNew) {
                created++;
            } else {
                updated++;
            }
        }

        log.info("전법 시트 동기화 - 시트 {}행, 신규 {}, 갱신 {}, 건너뜀 {}",
                sheetRows, created, updated, skipped.size());
        return new SheetResult(sheetRows, created, updated, skipped);
    }

    // ---------------------------------------------------------------
    // 버프
    // ---------------------------------------------------------------

    @Transactional
    public SheetResult syncBuffs() throws IOException, InterruptedException {
        List<List<String>> rows = fetch(buffUrl, "app.sheet.buff-csv-url", "BUFF_SHEET_CSV_URL");
        SheetColumns col = SheetColumns.of(rows);

        int sheetRows = 0;
        int created = 0;
        int updated = 0;
        List<String> skipped = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            String name = SheetColumns.cell(row, col.require(H_BUFF_NAME));
            String description = SheetColumns.cell(row, col.require(H_BUFF_DESC));
            if (name.isEmpty()) {
                continue;
            }
            sheetRows++;

            if (description.isEmpty()) {
                skipped.add("%s: 설명이 비어 있습니다".formatted(name));
                continue;
            }

            String[] categories;
            try {
                categories = parseCategories(SheetColumns.cell(row, col.require(H_BUFF_CATEGORY)));
            } catch (IllegalArgumentException e) {
                skipped.add("%s: %s".formatted(name, e.getMessage()));
                continue;
            }

            var existing = buffRepository.findByName(name);
            Buff b = existing.orElseGet(() -> new Buff(name, description));
            boolean isNew = existing.isEmpty();

            b.setDescription(description);
            b.setCategories(categories);
            buffRepository.save(b);
            if (isNew) {
                created++;
            } else {
                updated++;
            }
        }

        log.info("버프 시트 동기화 - 시트 {}행, 신규 {}, 갱신 {}, 건너뜀 {}",
                sheetRows, created, updated, skipped.size());
        return new SheetResult(sheetRows, created, updated, skipped);
    }

    /** 분류는 «이상 상태, 제어 상태» 처럼 쉼표로 여러 개가 온다. 비어 있어도 된다. */
    private static String[] parseCategories(String raw) {
        if (raw.isEmpty()) {
            return new String[0];
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String part : raw.split("[,·/]")) {
            String v = part.trim();
            if (v.isEmpty()) {
                continue;
            }
            String code = BUFF_CATEGORY.get(v);
            if (code == null) {
                throw new IllegalArgumentException("알 수 없는 버프 분류 \"%s\"".formatted(v));
            }
            out.add(code);
        }
        return out.toArray(String[]::new);
    }

    // ---------------------------------------------------------------
    // 공통
    // ---------------------------------------------------------------

    private List<List<String>> fetch(String url, String property, String envVar)
            throws IOException, InterruptedException {
        if (url == null || url.isBlank()) {
            throw new IllegalStateException(
                    "%s (환경변수 %s) 가 설정되지 않았습니다.".formatted(property, envVar));
        }
        HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(30))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() != 200) {
            throw new IllegalStateException(
                    "시트를 받지 못했습니다 (HTTP %d). 공개 설정을 확인하세요.".formatted(res.statusCode()));
        }
        return CsvReader.parseRows(res.body());
    }

    private static <T> T lookup(Map<String, T> table, String raw, String what) {
        String key = raw.trim();
        T value = table.get(key);
        if (value == null) {
            throw new IllegalArgumentException(
                    "알 수 없는 %s \"%s\" (가능한 값: %s)"
                            .formatted(what, key, new LinkedHashMap<>(table).keySet()));
        }
        return value;
    }

    /**
     * 발동률을 퍼센트 수치로 바꾼다.
     *
     * <p>시트가 두 가지로 담고 있다. 백분율 서식이면 {@code 0.75} 같은 «비율» 이,
     * 사람이 직접 친 칸이면 {@code "75%"} 같은 «글자» 가 내려온다.
     * 1 이하면 비율로 보고 100을 곱한다(100% 를 1.0 으로 적는 칸이 실제로 있다).
     *
     * <p>형식이 깨진 값(예: {@code "100%%"})은 고쳐 넣지 않고 비운다.
     * 그럴듯하게 메우면 나중에 실제 값인지 알 수 없게 된다.
     */
    private static BigDecimal percent(String raw) {
        if (raw.contains("%%")) {
            return null;
        }
        String v = raw.replace("%", "").trim();
        if (v.isEmpty()) {
            return null;
        }
        try {
            BigDecimal n = new BigDecimal(v);
            return n.compareTo(BigDecimal.ONE) <= 0 ? n.multiply(new BigDecimal("100")) : n;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer intOrNull(String raw) {
        String v = raw.trim();
        if (v.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(v).intValue();
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
