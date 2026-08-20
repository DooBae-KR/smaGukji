package com.smagukji.backend.web.hr;

import com.smagukji.backend.config.SupabaseProfiles;
import com.smagukji.backend.config.SupabaseProfiles.Actor;
import com.smagukji.backend.service.hr.MemberDirectoryService;
import com.smagukji.backend.service.hr.MemberWeekImportService;
import com.smagukji.backend.service.hr.MemberWeekImportService.ImportResult;
import java.io.IOException;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 인사팀에서 이 서버에 남은 유일한 기능 — 주차 시트 적재.
 *
 * <p>조회·마커·주의는 전부 Supabase 로 직접 간다. 사람이 화면 앞에서 기다리는 일이라
 * 잠들었다 깨는 데 수십 초 걸리는 무료 인스턴스에 두면 안 되기 때문이다.
 *
 * <p>여기 남은 이유는 하나뿐이다. xlsx 를 읽으려면 Apache POI 가 필요하고,
 * 그건 브라우저에서 할 수 없다. 업로드는 버튼을 눌러서 하는 일이라 기다림을 납득할 수 있다.
 *
 * <p>인증은 Supabase 액세스 토큰으로 한다. URL 규칙(SecurityConfig)이 이미 관리자·간부진만
 * 통과시키지만, 그것만으로는 «어느 동맹인지» 를 가릴 수 없어 여기서 한 번 더 확인한다.
 */
@RestController
@RequestMapping("/api/hr")
public class HrMemberController {

    private final SupabaseProfiles profiles;
    private final MemberDirectoryService directoryService;
    private final MemberWeekImportService importService;

    public HrMemberController(SupabaseProfiles profiles,
            MemberDirectoryService directoryService, MemberWeekImportService importService) {
        this.profiles = profiles;
        this.directoryService = directoryService;
        this.importService = importService;
    }

    /**
     * MemberWeek&lt;YYYYMMDD&gt;.xlsx 업로드.
     * 기준일은 파일명에서 뽑고, 못 뽑으면 {@code snapshotDate} 를 명시해야 한다.
     */
    @PostMapping(value = "/members/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportResult importSheet(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam String server,
            @RequestParam String alliance,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate snapshotDate,
            @RequestPart("file") MultipartFile file) throws IOException {

        Actor actor = profiles.find(jwt)
                .orElseThrow(() -> new AccessDeniedException("등록되지 않았거나 중지된 계정입니다."));

        // 요청 파라미터는 «확인용»일 뿐 권위 값이 아니다.
        // 이 검사가 없으면 A동맹 간부가 파라미터만 B동맹으로 바꿔 남의 명부를 덮어쓸 수 있다.
        UUID requested = directoryService.requireAlliance(server, alliance).getId();
        if (!actor.canAccess(requested)) {
            throw new AccessDeniedException("본인 소속 동맹만 관리할 수 있습니다.");
        }

        if (file.isEmpty()) {
            throw new IllegalArgumentException("빈 파일입니다.");
        }
        try (var input = file.getInputStream()) {
            return importService.importSheet(requested, file.getOriginalFilename(),
                    snapshotDate, input);
        }
    }
}
