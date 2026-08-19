package com.smagukji.backend.service.hr;

import com.smagukji.backend.domain.Alliance;
import com.smagukji.backend.domain.MemberWeek;
import com.smagukji.backend.repository.AllianceRepository;
import com.smagukji.backend.repository.MemberWeekRepository;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * MemberWeek&lt;YYYYMMDD&gt;.xlsx 를 주차 스냅샷으로 적재한다.
 *
 * <p>기준일은 파일명에서 뽑는다. 시트 안에 날짜 컬럼이 없기 때문이다.
 * 같은 (동맹, 일자, cid) 가 이미 있으면 덮어쓴다.
 *
 * <p>컬럼은 순서가 아니라 <b>헤더 이름</b>으로 찾는다. 게임 쪽에서 컬럼 순서를 바꿔도 깨지지 않게 하기 위해서다.
 */
@Service
public class MemberWeekImportService {

    private static final Logger log = LoggerFactory.getLogger(MemberWeekImportService.class);

    /** MemberWeek20260814.xlsx → 2026-08-14 */
    private static final Pattern FILE_DATE = Pattern.compile("(?i)memberweek[^0-9]*(\\d{8})");
    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.BASIC_ISO_DATE;

    // 시트 헤더 → 내부 필드. 동의어를 함께 받아 사소한 표기 차이를 흡수한다.
    private static final Map<String, String> HEADER_ALIASES = Map.ofEntries(
            Map.entry("캐릭터id", "cid"),
            Map.entry("캐릭터아이디", "cid"),
            Map.entry("cid", "cid"),
            Map.entry("멤버", "memberName"),
            Map.entry("이름", "memberName"),
            Map.entry("닉네임", "memberName"),
            Map.entry("직업", "job"),
            Map.entry("조별", "teamGroup"),
            Map.entry("조", "teamGroup"),
            Map.entry("직위", "position"),
            Map.entry("번영", "prosperity"),
            Map.entry("주간무훈", "weeklyMerit"),
            Map.entry("주간공헌", "weeklyContribution"),
            Map.entry("주둔지", "garrison"),
            Map.entry("주공성횟수", "weeklySiegeCount"));

    private final MemberWeekRepository memberWeekRepository;
    private final AllianceRepository allianceRepository;

    public MemberWeekImportService(MemberWeekRepository memberWeekRepository,
            AllianceRepository allianceRepository) {
        this.memberWeekRepository = memberWeekRepository;
        this.allianceRepository = allianceRepository;
    }

    /**
     * 적재 결과.
     *
     * @param snapshotDate 파일명에서 추출한 기준일
     * @param imported     이번에 적재한 행 수
     * @param replaced     같은 주차에 있던 기존 행 중 교체된 수
     * @param skipped      cid 가 비어 건너뛴 행
     * @param errors       행 단위 파싱 오류 (DB 반영 전에 걸러진 것)
     */
    public record ImportResult(UUID allianceId, String server, String allianceName,
            LocalDate snapshotDate, int imported, int replaced, int skipped, List<String> errors) {

        public int total() {
            return imported;
        }
    }

    /** 파일명에서 기준일을 뽑는다. 못 뽑으면 호출자가 명시적으로 넘겨야 한다. */
    public static Optional<LocalDate> parseSnapshotDate(String fileName) {
        if (fileName == null) {
            return Optional.empty();
        }
        Matcher m = FILE_DATE.matcher(fileName);
        if (!m.find()) {
            return Optional.empty();
        }
        try {
            return Optional.of(LocalDate.parse(m.group(1), YYYYMMDD));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    /**
     * 시트를 적재한다.
     *
     * <p>대상 동맹은 <b>호출자가 세션에서 확인한 allianceId</b> 로만 지정한다. 예전처럼
     * (server, name) 을 받아 없으면 만들어주면, 인증된 아무나 임의의 동맹을 만들거나
     * 남의 동맹 명부를 덮어쓸 수 있다.
     */
    @Transactional
    public ImportResult importSheet(UUID allianceId, String fileName,
            LocalDate explicitDate, InputStream input) throws IOException {

        LocalDate snapshotDate = explicitDate != null
                ? explicitDate
                : parseSnapshotDate(fileName).orElseThrow(() -> new IllegalArgumentException(
                        "파일명에서 기준일을 찾지 못했습니다. MemberWeek20260814.xlsx 형식이거나 "
                                + "snapshotDate 를 직접 지정해야 합니다: " + fileName));

        Alliance alliance = allianceRepository.findById(allianceId)
                .orElseThrow(() -> new IllegalArgumentException("동맹을 찾을 수 없습니다: " + allianceId));

        // 1단계 — 시트를 메모리에서 전부 파싱한다. 여기서는 DB 를 건드리지 않는다.
        //
        // 예전에는 행마다 DB 를 조회·저장하면서 예외를 잡아 넘겼는데, PostgreSQL 에서는
        // 트랜잭션 안에서 SQL 이 한 번 실패하면 그 트랜잭션 전체가 죽는다(25P02).
        // 그래서 첫 오류 이후의 모든 행이 줄줄이 실패하고, 커밋에서 UnexpectedRollbackException
        // 이 터졌다. 파싱 오류와 DB 작업을 분리해야 «한 행이 이상해도 나머지는 들어간다»가 성립한다.
        int skipped = 0;
        List<String> errors = new ArrayList<>();
        Set<String> seenCids = new HashSet<>();
        List<MemberWeek> parsed = new ArrayList<>();

        try (Workbook workbook = WorkbookFactory.create(input)) {
            Sheet sheet = workbook.getSheetAt(0);
            DataFormatter formatter = new DataFormatter(Locale.KOREA);

            Row headerRow = sheet.getRow(sheet.getFirstRowNum());
            if (headerRow == null) {
                throw new IllegalArgumentException("빈 시트입니다.");
            }
            Map<String, Integer> columns = mapColumns(headerRow, formatter);
            // cid 와 멤버명이 없으면 조용히 빈 이름으로 적재되어 나중에 아무도 알아채지 못한다.
            // 둘 다 필수로 막는다.
            List<String> missing = new ArrayList<>();
            if (!columns.containsKey("cid")) {
                missing.add("캐릭터 ID");
            }
            if (!columns.containsKey("memberName")) {
                missing.add("멤버");
            }
            if (!missing.isEmpty()) {
                throw new IllegalArgumentException("필수 컬럼을 찾지 못했습니다: %s. 읽어들인 헤더: %s"
                        .formatted(String.join(", ", missing), readHeaders(headerRow, formatter)));
            }

            for (int r = headerRow.getRowNum() + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) {
                    continue;
                }
                String cid = text(row, columns.get("cid"), formatter);
                if (cid.isBlank()) {
                    skipped++;
                    continue;
                }
                if (!seenCids.add(cid)) {
                    errors.add("%d행: cid %s 가 시트 안에서 중복입니다. 첫 행만 반영했습니다.".formatted(r + 1, cid));
                    continue;
                }

                try {
                    MemberWeek week = new MemberWeek(alliance.getId(), snapshotDate, cid,
                            text(row, columns.get("memberName"), formatter));
                    week.setJob(nullIfBlank(text(row, columns.get("job"), formatter)));
                    week.setTeamGroup(nullIfBlank(text(row, columns.get("teamGroup"), formatter)));
                    week.setPosition(nullIfBlank(text(row, columns.get("position"), formatter)));
                    week.setProsperity(number(row, columns.get("prosperity"), formatter));
                    week.setWeeklyMerit(number(row, columns.get("weeklyMerit"), formatter));
                    week.setWeeklyContribution(
                            number(row, columns.get("weeklyContribution"), formatter));
                    week.setGarrison(nullIfBlank(text(row, columns.get("garrison"), formatter)));
                    Long siege = number(row, columns.get("weeklySiegeCount"), formatter);
                    week.setWeeklySiegeCount(siege == null ? null : siege.intValue());
                    week.setSourceFile(fileName);
                    parsed.add(week);
                } catch (RuntimeException e) {
                    // 순수 파싱 오류다. DB 를 아직 건드리지 않았으므로 건너뛰어도 안전하다.
                    errors.add("%d행(cid %s): %s".formatted(r + 1, cid, e.getMessage()));
                }
            }
        }

        // 2단계 — 그 주차를 통째로 교체한다.
        //
        // 시트가 해당 주차의 유일한 진실이므로 «재업로드 = 교체»가 맞다. 행마다 조회 후
        // 삽입하면 (1) 같은 주차를 동시에 두 번 올릴 때 중복 키가 나고,
        // (2) 시트에서 빠진 탈퇴자 행이 계속 남는다.
        int replaced = memberWeekRepository.deleteByAllianceIdAndSnapshotDate(
                alliance.getId(), snapshotDate);
        // 삭제가 삽입보다 먼저 DB 에 닿아야 유니크 제약에 걸리지 않는다.
        memberWeekRepository.flush();
        memberWeekRepository.saveAll(parsed);

        log.info("주차 시트 적재 - {}/{} {} : 적재 {}, 교체 {}, 건너뜀 {}, 파싱오류 {}",
                alliance.getServer(), alliance.getName(), snapshotDate,
                parsed.size(), replaced, skipped, errors.size());

        return new ImportResult(alliance.getId(), alliance.getServer(), alliance.getName(),
                snapshotDate, parsed.size(), replaced, skipped, errors);
    }

    // ---------------------------------------------------------------

    private static Map<String, Integer> mapColumns(Row header, DataFormatter formatter) {
        Map<String, Integer> columns = new HashMap<>();
        // 셀이 하나도 없는 행은 getFirstCellNum() 이 -1 이라 그대로 쓰면 POI 가 터진다.
        if (header.getFirstCellNum() < 0) {
            return columns;
        }
        for (int c = header.getFirstCellNum(); c < header.getLastCellNum(); c++) {
            String raw = formatter.formatCellValue(header.getCell(c));
            String key = normalizeHeader(raw);
            String field = HEADER_ALIASES.get(key);
            if (field != null) {
                columns.putIfAbsent(field, c);
            }
        }
        return columns;
    }

    private static List<String> readHeaders(Row header, DataFormatter formatter) {
        List<String> out = new ArrayList<>();
        if (header.getFirstCellNum() < 0) {
            return out;
        }
        for (int c = header.getFirstCellNum(); c < header.getLastCellNum(); c++) {
            out.add(formatter.formatCellValue(header.getCell(c)));
        }
        return out;
    }

    /** 공백과 대소문자를 없애 «주간 무훈» 과 «주간무훈» 을 같게 본다. */
    private static String normalizeHeader(String raw) {
        return raw == null ? "" : raw.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private static String text(Row row, Integer index, DataFormatter formatter) {
        if (index == null) {
            return "";
        }
        Cell cell = row.getCell(index);
        if (cell == null) {
            return "";
        }
        // 숫자로 저장된 cid 가 1.0E10 처럼 나오는 것을 막는다.
        if (cell.getCellType() == CellType.NUMERIC) {
            return BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString();
        }
        return formatter.formatCellValue(cell).trim();
    }

    private static Long number(Row row, Integer index, DataFormatter formatter) {
        String raw = text(row, index, formatter);
        if (raw.isBlank() || "--".equals(raw) || "-".equals(raw)) {
            return null;
        }
        try {
            return new BigDecimal(raw.replace(",", "")).longValue();
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String nullIfBlank(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
