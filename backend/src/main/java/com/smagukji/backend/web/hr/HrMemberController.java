package com.smagukji.backend.web.hr;

import com.smagukji.backend.domain.MarkerType;
import com.smagukji.backend.service.hr.AuthService;
import com.smagukji.backend.service.hr.AuthService.AuthenticatedAccount;
import com.smagukji.backend.service.hr.MarkerService;
import com.smagukji.backend.service.hr.MemberDirectoryService;
import com.smagukji.backend.service.hr.MemberDirectoryService.DirectorySnapshot;
import com.smagukji.backend.service.hr.MemberWeekImportService;
import com.smagukji.backend.service.hr.MemberWeekImportService.ImportResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 인사팀 동맹원 API.
 *
 * <p>모든 엔드포인트는 {@code X-Session-Token} 이 필요하다. 로그인 없이 동맹 정보를 볼 수 없다.
 */
@RestController
@RequestMapping("/api/hr")
public class HrMemberController {

    private final AuthService authService;
    private final MemberDirectoryService directoryService;
    private final MemberWeekImportService importService;
    private final MarkerService markerService;

    public HrMemberController(AuthService authService, MemberDirectoryService directoryService,
            MemberWeekImportService importService, MarkerService markerService) {
        this.authService = authService;
        this.directoryService = directoryService;
        this.importService = importService;
        this.markerService = markerService;
    }

    /**
     * 세션을 확인하고, 요청한 동맹이 <b>그 세션의 동맹과 같은지</b> 검사한다.
     *
     * <p>이 검사가 없으면 A동맹 계정으로 로그인한 뒤 쿼리 파라미터만 B동맹으로 바꿔
     * 남의 동맹 명부를 통째로 읽거나 마커를 바꿔버릴 수 있다. 세션에 담긴 동맹이 유일한
     * 권위 값이고, 파라미터는 확인용일 뿐이다.
     */
    private Scoped scoped(String token, String server, String alliance) {
        AuthenticatedAccount actor = authService.requireSession(token);
        // 인사 탭은 관리자와 간부진만 쓴다. 동맹원은 시뮬레이션만 사용한다.
        if (!actor.role().canManageHr()) {
            throw new AuthService.AuthFailedException(
                    "인사 관리 권한이 없습니다. 관리자 또는 간부진만 사용할 수 있습니다.");
        }
        UUID requested = directoryService.requireAlliance(server, alliance).getId();
        if (actor.allianceId() == null || !actor.allianceId().equals(requested)) {
            throw new AuthService.AuthFailedException("이 동맹에 접근할 권한이 없습니다.");
        }
        return new Scoped(actor, requested);
    }

    private record Scoped(AuthenticatedAccount actor, UUID allianceId) {
    }

    // ---------------------------------------------------------------
    // 그리드
    // ---------------------------------------------------------------

    /**
     * 서버 + 동맹 + (선택)주차로 그리드를 조회한다.
     * 주차를 비우면 가장 최근 주차를 보여준다.
     */
    @GetMapping("/members")
    public DirectorySnapshot grid(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate snapshotDate) {

        scoped(token, server, alliance);
        return directoryService.loadGrid(server, alliance, snapshotDate);
    }

    /** 해당 동맹에 적재된 주차 목록. */
    @GetMapping("/members/dates")
    public List<LocalDate> dates(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance) {

        return directoryService.availableDates(scoped(token, server, alliance).allianceId());
    }

    // ---------------------------------------------------------------
    // 시트 적재
    // ---------------------------------------------------------------

    /**
     * MemberWeek&lt;YYYYMMDD&gt;.xlsx 업로드.
     * 기준일은 파일명에서 뽑고, 못 뽑으면 {@code snapshotDate} 를 명시해야 한다.
     */
    @PostMapping(value = "/members/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportResult importSheet(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate snapshotDate,
            @RequestPart("file") MultipartFile file) throws IOException {

        // 세션의 동맹으로만 적재할 수 있다. 파라미터로 남의 동맹을 지정하거나
        // 존재하지 않는 동맹을 임의로 만들어내는 것을 막는다.
        Scoped s = scoped(token, server, alliance);
        if (file.isEmpty()) {
            throw new IllegalArgumentException("빈 파일입니다.");
        }
        try (var input = file.getInputStream()) {
            return importService.importSheet(s.allianceId(), file.getOriginalFilename(),
                    snapshotDate, input);
        }
    }

    // ---------------------------------------------------------------
    // 마커
    // ---------------------------------------------------------------

    public record ToggleRequest(
            @NotBlank(message = "cid는 필수입니다") String cid,
            @NotBlank(message = "마커 종류는 필수입니다") String markerType,
            boolean enabled,
            String reason) {
    }

    /**
     * 마커 켜기/끄기.
     * 주의(CAUTION)를 켤 때는 {@code reason} 이 반드시 있어야 한다.
     */
    @PostMapping("/markers")
    public MarkerService.MarkerState toggleMarker(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @Valid @RequestBody ToggleRequest request) {

        Scoped s = scoped(token, server, alliance);
        MarkerType type = MarkerType.valueOf(
                request.markerType().toUpperCase(java.util.Locale.ROOT));

        return markerService.toggle(s.allianceId(), request.cid(), type, request.enabled(),
                request.reason(), s.actor().loginId());
    }

    @GetMapping("/markers/{cid}")
    public List<MarkerService.MarkerState> markersOf(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @PathVariable String cid) {

        return markerService.markersOf(scoped(token, server, alliance).allianceId(), cid);
    }

    /** 화면에서 쓸 마커 메타. 색을 프론트에 하드코딩하지 않기 위해 내려준다. */
    public record MarkerMeta(String code, String label, String color, boolean requiresReason) {
    }

    /**
     * requiresReason 은 반드시 boolean 으로 내보낸다. 문자열 {@code "false"} 로 보내면
     * 프론트에서 truthy 로 평가되어 조건문이 항상 참이 된다.
     */
    @GetMapping("/markers/meta")
    public List<MarkerMeta> markerMeta() {
        return java.util.Arrays.stream(MarkerType.values())
                .map(t -> new MarkerMeta(t.name(), t.label(), t.color(), t.requiresReason()))
                .toList();
    }

    // ---------------------------------------------------------------
    // 주의
    // ---------------------------------------------------------------

    /** 주의 화면. {@code q} 로 cid 또는 멤버명을 검색한다. */
    @GetMapping("/cautions")
    public List<MarkerService.CautionEntry> cautions(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean onlyOpen) {

        return markerService.cautionBoard(scoped(token, server, alliance).allianceId(), q, onlyOpen);
    }

    public record CautionRequest(
            @NotBlank(message = "cid는 필수입니다") String cid,
            @NotBlank(message = "주의 사유는 필수입니다") String reason) {
    }

    @PostMapping("/cautions")
    public MarkerService.NoteView addCaution(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @Valid @RequestBody CautionRequest request) {

        Scoped s = scoped(token, server, alliance);
        return markerService.addCaution(s.allianceId(), request.cid(), request.reason(),
                s.actor().loginId());
    }

    @PostMapping("/cautions/{noteId}/resolve")
    public Map<String, String> resolveCaution(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @PathVariable UUID noteId) {

        markerService.resolveCaution(scoped(token, server, alliance).allianceId(), noteId);
        return Map.of("status", "resolved");
    }

    /** 주의 사유 완전 삭제. «해제»와 달리 되돌릴 수 없다. */
    @DeleteMapping("/cautions/{noteId}")
    public Map<String, String> deleteCaution(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @RequestParam String server,
            @RequestParam String alliance,
            @PathVariable UUID noteId) {

        markerService.deleteCaution(scoped(token, server, alliance).allianceId(), noteId);
        return Map.of("status", "deleted");
    }
}
