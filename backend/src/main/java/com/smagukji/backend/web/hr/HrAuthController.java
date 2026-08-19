package com.smagukji.backend.web.hr;

import com.smagukji.backend.domain.AccountRole;
import com.smagukji.backend.service.hr.AuthService;
import com.smagukji.backend.service.hr.AuthService.AuthenticatedAccount;
import com.smagukji.backend.service.hr.AuthService.LoginResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 인사팀 인증 API.
 *
 * <p>세션 토큰은 응답 본문으로 1회만 내려주고, 이후 요청은 {@code X-Session-Token} 헤더로 보낸다.
 */
@RestController
@RequestMapping("/api/hr/auth")
public class HrAuthController {

    public static final String TOKEN_HEADER = "X-Session-Token";

    private final AuthService authService;

    public HrAuthController(AuthService authService) {
        this.authService = authService;
    }

    // ---------------------------------------------------------------
    // 회원가입 · 로그인
    // ---------------------------------------------------------------

    public record RegisterRequest(
            @NotBlank(message = "ID는 필수입니다") String loginId,
            @NotBlank @Size(min = 4, message = "비밀번호는 4자 이상이어야 합니다") String password,
            @NotBlank(message = "표시 이름은 필수입니다") String displayName,
            @NotBlank(message = "서버는 필수입니다") String server,
            @NotBlank(message = "동맹 이름은 필수입니다") String allianceName,
            String cid) {
    }

    /**
     * 회원가입. 동맹 정보를 함께 입력받아 동맹을 만들거나 기존 동맹에 합류한다.
     * 그 동맹의 첫 가입자는 관리자가 되고, 이후 가입자는 일반 멤버가 된다.
     * 가입 즉시 로그인 상태가 되도록 토큰을 함께 발급한다.
     */
    @PostMapping("/register")
    public LoginResult register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request.server(), request.allianceName(), request.loginId(),
                request.password(), request.displayName(), request.cid());
    }

    public record LoginRequest(
            @NotBlank(message = "ID는 필수입니다") String loginId,
            @NotBlank(message = "비밀번호는 필수입니다") String password) {
    }

    /** ID/PW 로그인. 역할(ADMIN/MEMBER)은 계정에 저장된 값을 따른다. */
    @PostMapping("/login")
    public LoginResult login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request.loginId(), request.password());
    }

    @PostMapping("/logout")
    public Map<String, String> logout(@RequestHeader(value = TOKEN_HEADER, required = false) String token) {
        authService.logout(token);
        return Map.of("status", "logged-out");
    }

    @GetMapping("/me")
    public AuthenticatedAccount me(@RequestHeader(value = TOKEN_HEADER, required = false) String token) {
        return authService.requireSession(token);
    }

    // ---------------------------------------------------------------
    // 계정 관리 (관리자만)
    // ---------------------------------------------------------------

    public record CreateAccountRequest(
            UUID allianceId,
            @NotBlank(message = "ID는 필수입니다") String loginId,
            @NotBlank @Size(min = 4, message = "비밀번호는 4자 이상이어야 합니다") String password,
            @NotBlank(message = "표시 이름은 필수입니다") String displayName,
            String role,
            String cid) {
    }

    @PostMapping("/accounts")
    public Map<String, String> createAccount(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @Valid @RequestBody CreateAccountRequest request) {

        AuthenticatedAccount actor = authService.requireSession(token);
        if (actor.role() != AccountRole.ADMIN) {
            throw new AuthService.AuthFailedException("관리자만 계정을 만들 수 있습니다.");
        }
        if (actor.allianceId() == null) {
            throw new AuthService.AuthFailedException("소속 동맹이 없는 관리자는 계정을 만들 수 없습니다.");
        }
        // 요청 본문의 allianceId 는 신뢰하지 않는다. 그대로 쓰면 A동맹 관리자가
        // B동맹에 계정(심지어 ADMIN)을 심을 수 있다.
        if (request.allianceId() != null && !request.allianceId().equals(actor.allianceId())) {
            throw new AuthService.AuthFailedException("다른 동맹에는 계정을 만들 수 없습니다.");
        }

        AccountRole role = request.role() == null ? AccountRole.MEMBER
                : AccountRole.valueOf(request.role().toUpperCase(java.util.Locale.ROOT));

        UUID id = authService.createAccount(actor.allianceId(), request.loginId(),
                request.password(), role, request.displayName(), request.cid());
        return Map.of("accountId", id.toString(), "loginId", request.loginId());
    }

    /** 같은 동맹의 계정 목록. 관리자만 볼 수 있다. */
    @GetMapping("/accounts")
    public List<AuthService.AccountSummary> listAccounts(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token) {
        AuthenticatedAccount actor = requireAdmin(token);
        return authService.listAccounts(actor.allianceId());
    }

    @DeleteMapping("/accounts/{accountId}")
    public Map<String, String> deleteAccount(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @PathVariable UUID accountId) {

        AuthenticatedAccount actor = requireAdmin(token);
        authService.deleteAccount(actor.accountId(), actor.allianceId(), accountId);
        return Map.of("status", "deleted");
    }

    public record RoleChangeRequest(@NotBlank(message = "역할은 필수입니다") String role) {
    }

    /** 계정 역할 변경. 관리자 / 간부진 / 동맹원 중 하나로 바꾼다. */
    @PatchMapping("/accounts/{accountId}/role")
    public Map<String, String> changeRole(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @PathVariable UUID accountId,
            @Valid @RequestBody RoleChangeRequest request) {

        AuthenticatedAccount actor = requireAdmin(token);
        AccountRole role = AccountRole.valueOf(request.role().trim().toUpperCase(java.util.Locale.ROOT));
        authService.changeRole(actor.accountId(), actor.allianceId(), accountId, role);
        return Map.of("status", "changed", "role", role.name(),
                "note", "해당 계정은 다시 로그인해야 새 권한이 적용됩니다.");
    }

    private AuthenticatedAccount requireAdmin(String token) {
        AuthenticatedAccount actor = authService.requireSession(token);
        if (!actor.role().canManageSystem()) {
            throw new AuthService.AuthFailedException("관리자만 수행할 수 있습니다.");
        }
        return actor;
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "현재 비밀번호는 필수입니다") String currentPassword,
            @NotBlank @Size(min = 4, message = "새 비밀번호는 4자 이상이어야 합니다") String newPassword) {
    }

    /**
     * 본인 비밀번호 변경. 현재 비밀번호를 확인한 뒤 바꾸고, 기존 세션을 전부 끊는다.
     * (그래서 변경 후에는 다시 로그인해야 한다)
     */
    @PostMapping("/password")
    public Map<String, String> changePassword(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @Valid @RequestBody ChangePasswordRequest request) {

        AuthenticatedAccount actor = authService.requireSession(token);
        authService.changeOwnPassword(actor.accountId(), request.currentPassword(),
                request.newPassword());
        return Map.of("status", "changed", "note", "모든 세션이 만료되었습니다. 다시 로그인하세요.");
    }
}
