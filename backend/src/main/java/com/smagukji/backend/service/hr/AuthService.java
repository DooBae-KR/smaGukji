package com.smagukji.backend.service.hr;

import com.smagukji.backend.domain.AccountRole;
import com.smagukji.backend.domain.Alliance;
import com.smagukji.backend.domain.AppAccount;
import com.smagukji.backend.domain.AppSession;
import com.smagukji.backend.repository.AllianceRepository;
import com.smagukji.backend.repository.AppAccountRepository;
import com.smagukji.backend.repository.AppSessionRepository;
import com.smagukji.backend.web.ResourceNotFoundException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 인사팀 인증.
 *
 * <p>흐름은 사용자가 요청한 대로 2단계다.
 * <ol>
 *   <li>관리자 ID 입력 — 어느 동맹의 인사 화면인지 고르는 <b>게이트</b>. 이것만으로는 아무 데이터도 주지 않는다.</li>
 *   <li>동맹원 ID/PW 입력 — 실제 <b>인증</b>. 통과하면 세션 토큰을 발급하고 그때부터 동맹 정보를 볼 수 있다.</li>
 * </ol>
 *
 * <p>🔒 원칙
 * <ul>
 *   <li>비밀번호는 BCrypt 해시로만 저장한다. 평문은 로그·응답·DB 어디에도 남기지 않는다.</li>
 *   <li>세션 토큰은 SHA-256 해시만 저장한다. 원문은 발급 시 1회만 클라이언트에 준다.</li>
 *   <li>이 계정은 이 앱 전용이다. 게임 계정 자격증명을 받지 않는다.</li>
 * </ul>
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final int SESSION_HOURS = 12;
    private static final int TOKEN_BYTES = 32;

    /**
     * 최소 비밀번호 길이.
     *
     * <p>⚠️ 로컬 개인 도구 기준으로 4자까지 허용한다. 이 앱을 사내망 밖이나 인터넷에
     * 노출한다면 반드시 8 이상으로 올려야 한다. BCrypt 해시라도 4자리는 사실상 즉시 뚫린다.
     */
    public static final int MIN_PASSWORD_LENGTH = 4;

    private final AppAccountRepository accountRepository;
    private final AppSessionRepository sessionRepository;
    private final AllianceRepository allianceRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();

    public AuthService(AppAccountRepository accountRepository,
            AppSessionRepository sessionRepository, AllianceRepository allianceRepository) {
        this.accountRepository = accountRepository;
        this.sessionRepository = sessionRepository;
        this.allianceRepository = allianceRepository;
    }

    /** 인증 실패. 원인을 세분화하지 않는다(ID 존재 여부가 새어나가지 않게). */
    public static class AuthFailedException extends RuntimeException {
        public AuthFailedException(String message) {
            super(message);
        }
    }

    public record LoginResult(String token, OffsetDateTime expiresAt, String displayName,
            String role, UUID allianceId, String server, String allianceName, String cid) {
    }

    public record AuthenticatedAccount(UUID accountId, String loginId, AccountRole role,
            UUID allianceId, String displayName, String cid) {
    }

    // ---------------------------------------------------------------
    // 회원가입
    // ---------------------------------------------------------------

    /**
     * 회원가입. 서버와 동맹 이름을 함께 받아 동맹을 만들거나 기존 동맹에 합류한다.
     *
     * <p>역할은 자동으로 정해진다.
     * <ul>
     *   <li>그 동맹의 <b>첫 가입자</b> → ADMIN. 동맹을 개설한 사람이므로 관리 권한을 갖는다.</li>
     *   <li>이미 계정이 있는 동맹에 가입 → MEMBER. 모르는 사람이 남의 동맹 관리자가 되는 것을 막는다.</li>
     * </ul>
     * 가입 즉시 로그인 상태가 되도록 세션을 함께 발급한다.
     */
    @Transactional
    public LoginResult register(String server, String allianceName, String loginId,
            String rawPassword, String displayName, String cid) {

        if (accountRepository.findByLoginId(loginId).isPresent()) {
            throw new IllegalArgumentException("이미 사용 중인 ID 입니다: " + loginId);
        }

        Alliance alliance = allianceRepository.findByServerAndName(server, allianceName)
                .orElseGet(() -> allianceRepository.save(new Alliance(server, allianceName)));

        boolean firstOfAlliance =
                accountRepository.findAllByAllianceIdOrderByLoginIdAsc(alliance.getId()).isEmpty();
        AccountRole role = firstOfAlliance ? AccountRole.ADMIN : AccountRole.MEMBER;

        AppAccount account = new AppAccount(alliance.getId(), loginId, hash(rawPassword),
                role, displayName);
        account.setCid(cid == null || cid.isBlank() ? null : cid.trim());
        accountRepository.save(account);

        log.info("회원가입 accountId={} role={} alliance={}/{}",
                account.getId(), role, server, allianceName);

        return issueSession(account, alliance);
    }

    // ---------------------------------------------------------------
    // 로그인
    // ---------------------------------------------------------------

    /**
     * ID/PW 로 인증하고 세션을 발급한다. 역할은 계정에 저장된 값을 따른다.
     *
     * <p>{@code noRollbackFor} 가 중요하다. AuthFailedException 은 RuntimeException 이라
     * 기본 규칙대로면 트랜잭션이 롤백되고, 방금 올린 실패 카운트가 함께 사라져 계정 잠금이
     * 영원히 동작하지 않는다.
     */
    @Transactional(noRollbackFor = AuthFailedException.class)
    public LoginResult login(String loginId, String rawPassword) {
        AppAccount account = accountRepository.findByLoginId(loginId)
                .orElseThrow(() -> new AuthFailedException("ID 또는 비밀번호가 올바르지 않습니다."));

        if (!account.isActive()) {
            throw new AuthFailedException("비활성 계정입니다. 관리자에게 문의하세요.");
        }
        if (account.isLocked()) {
            throw new AuthFailedException("로그인 시도가 많아 잠겼습니다. 잠시 후 다시 시도하세요.");
        }

        if (!encoder.matches(rawPassword, account.getPasswordHash())) {
            account.recordFailure();
            accountRepository.saveAndFlush(account);
            // 로그인 ID 는 사용자 입력이므로 로그에 그대로 넣지 않는다(로그 인젝션·PII).
            log.warn("로그인 실패 accountId={}", account.getId());
            throw new AuthFailedException("ID 또는 비밀번호가 올바르지 않습니다.");
        }

        account.recordSuccess();
        accountRepository.save(account);

        Alliance alliance = account.getAllianceId() == null ? null
                : allianceRepository.findById(account.getAllianceId()).orElse(null);
        return issueSession(account, alliance);
    }

    /** 세션 토큰을 발급한다. 원문 토큰은 이 반환값에만 실리고 저장되지 않는다. */
    private LoginResult issueSession(AppAccount account, Alliance alliance) {
        String token = newToken();
        OffsetDateTime expiresAt = OffsetDateTime.now().plusHours(SESSION_HOURS);
        sessionRepository.save(new AppSession(account.getId(), sha256(token), expiresAt));

        return new LoginResult(token, expiresAt, account.getDisplayName(), account.getRole().name(),
                account.getAllianceId(),
                alliance == null ? null : alliance.getServer(),
                alliance == null ? null : alliance.getName(),
                account.getCid());
    }

    // ---------------------------------------------------------------
    // 세션
    // ---------------------------------------------------------------

    @Transactional(readOnly = true)
    public AuthenticatedAccount requireSession(String token) {
        if (token == null || token.isBlank()) {
            throw new AuthFailedException("로그인이 필요합니다.");
        }
        AppSession session = sessionRepository.findByTokenHash(sha256(token))
                .orElseThrow(() -> new AuthFailedException("세션이 유효하지 않습니다. 다시 로그인하세요."));
        if (session.isExpired()) {
            throw new AuthFailedException("세션이 만료되었습니다. 다시 로그인하세요.");
        }
        AppAccount account = accountRepository.findById(session.getAccountId())
                .filter(AppAccount::isActive)
                .orElseThrow(() -> new AuthFailedException("계정을 사용할 수 없습니다."));

        return new AuthenticatedAccount(account.getId(), account.getLoginId(), account.getRole(),
                account.getAllianceId(), account.getDisplayName(), account.getCid());
    }

    @Transactional
    public void logout(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        sessionRepository.findByTokenHash(sha256(token)).ifPresent(sessionRepository::delete);
    }

    // ---------------------------------------------------------------
    // 계정 관리
    // ---------------------------------------------------------------

    @Transactional
    public UUID createAccount(UUID allianceId, String loginId, String rawPassword,
            AccountRole role, String displayName, String cid) {
        if (accountRepository.findByLoginId(loginId).isPresent()) {
            throw new IllegalArgumentException("이미 사용 중인 ID 입니다: " + loginId);
        }
        if (allianceId != null && allianceRepository.findById(allianceId).isEmpty()) {
            throw new ResourceNotFoundException("동맹을 찾을 수 없습니다: " + allianceId);
        }
        AppAccount account = new AppAccount(allianceId, loginId, hash(rawPassword), role, displayName);
        account.setCid(cid);
        return accountRepository.save(account).getId();
    }

    /** 현재 비밀번호를 확인한 뒤 교체한다. 성공하면 기존 세션을 모두 끊는다. */
    @Transactional
    public void changeOwnPassword(UUID accountId, String currentPassword, String newPassword) {
        AppAccount account = accountRepository.findById(accountId)
                .orElseThrow(() -> new ResourceNotFoundException("계정을 찾을 수 없습니다: " + accountId));

        if (!encoder.matches(currentPassword, account.getPasswordHash())) {
            throw new AuthFailedException("현재 비밀번호가 올바르지 않습니다.");
        }
        if (encoder.matches(newPassword, account.getPasswordHash())) {
            throw new IllegalArgumentException("이전과 다른 비밀번호를 사용하세요.");
        }

        account.setPasswordHash(hash(newPassword));
        accountRepository.save(account);
        // 비밀번호를 바꾸면 기존 토큰은 전부 무효가 되어야 한다.
        sessionRepository.deleteByAccountId(accountId);
    }

    @Transactional(readOnly = true)
    public boolean needsBootstrap() {
        return accountRepository.countByRole(AccountRole.ADMIN) == 0;
    }

    /**
     * 계정 삭제.
     *
     * <p>자기 자신, 다른 동맹의 계정, 그리고 그 동맹의 마지막 관리자는 지울 수 없다.
     * 동맹 범위를 확인하지 않으면 A동맹 관리자가 UUID 만 알아내 B동맹 계정을 지울 수 있다.
     */
    @Transactional
    public void deleteAccount(UUID actorId, UUID actorAllianceId, UUID targetId) {
        if (actorId.equals(targetId)) {
            throw new IllegalArgumentException("자기 자신은 삭제할 수 없습니다.");
        }
        AppAccount target = accountRepository.findById(targetId)
                .orElseThrow(() -> new ResourceNotFoundException("계정을 찾을 수 없습니다: " + targetId));

        if (actorAllianceId == null || !actorAllianceId.equals(target.getAllianceId())) {
            throw new AuthFailedException("다른 동맹의 계정은 삭제할 수 없습니다.");
        }

        if (target.getRole() == AccountRole.ADMIN && countAdminsOf(actorAllianceId) <= 1) {
            throw new IllegalStateException("이 동맹의 마지막 관리자 계정은 삭제할 수 없습니다.");
        }

        sessionRepository.deleteByAccountId(targetId);
        accountRepository.delete(target);
        log.info("계정 삭제 targetId={} by actorId={}", targetId, actorId);
    }

    /** 역할 변경. 마지막 관리자의 강등을 막는다. */
    @Transactional
    public void changeRole(UUID actorId, UUID actorAllianceId, UUID targetId, AccountRole newRole) {
        AppAccount target = accountRepository.findById(targetId)
                .orElseThrow(() -> new ResourceNotFoundException("계정을 찾을 수 없습니다: " + targetId));

        if (actorAllianceId == null || !actorAllianceId.equals(target.getAllianceId())) {
            throw new AuthFailedException("다른 동맹의 계정은 변경할 수 없습니다.");
        }
        if (target.getRole() == AccountRole.ADMIN && newRole != AccountRole.ADMIN
                && countAdminsOf(actorAllianceId) <= 1) {
            throw new IllegalStateException("이 동맹의 마지막 관리자는 강등할 수 없습니다.");
        }

        target.setRole(newRole);
        accountRepository.save(target);
        // 권한이 바뀌면 기존 세션의 역할 정보가 낡으므로 다시 로그인하게 한다.
        sessionRepository.deleteByAccountId(targetId);
        log.info("역할 변경 targetId={} -> {} by actorId={}", targetId, newRole, actorId);
    }

    private long countAdminsOf(UUID allianceId) {
        return accountRepository.findAllByAllianceIdOrderByLoginIdAsc(allianceId).stream()
                .filter(a -> a.getRole() == AccountRole.ADMIN)
                .count();
    }

    @Transactional(readOnly = true)
    public List<AccountSummary> listAccounts(UUID allianceId) {
        return accountRepository.findAllByAllianceIdOrderByLoginIdAsc(allianceId).stream()
                .map(a -> new AccountSummary(a.getId(), a.getLoginId(), a.getDisplayName(),
                        a.getRole().name(), a.getCid(), a.isActive(), a.getLastLoginAt()))
                .toList();
    }

    /** 계정 목록 응답. 비밀번호 해시는 절대 싣지 않는다. */
    public record AccountSummary(UUID id, String loginId, String displayName, String role,
            String cid, boolean active, OffsetDateTime lastLoginAt) {
    }

    // ---------------------------------------------------------------

    private String hash(String rawPassword) {
        if (rawPassword == null || rawPassword.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException(
                    "비밀번호는 " + MIN_PASSWORD_LENGTH + "자 이상이어야 합니다.");
        }
        // BCrypt 는 72바이트를 넘으면 조용히 잘라낸다. 잘림을 사용자가 모르게 두지 않는다.
        if (rawPassword.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("비밀번호는 72바이트를 넘을 수 없습니다.");
        }
        return encoder.encode(rawPassword);
    }

    private String newToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 을 사용할 수 없습니다", e);
        }
    }

    Optional<AppAccount> findByLoginId(String loginId) {
        return accountRepository.findByLoginId(loginId);
    }
}
