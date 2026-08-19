package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 이 앱 전용 계정.
 *
 * <p>🔒 게임 계정 자격증명이 아니다. 비밀번호는 BCrypt 해시로만 보관하며 평문은 어디에도 남기지 않는다.
 */
@Entity
@Table(name = "app_account")
public class AppAccount {

    /** 연속 실패 임계치. 넘으면 잠근다. */
    public static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCK_MINUTES = 15;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "alliance_id")
    private UUID allianceId;

    @Column(name = "login_id", nullable = false, unique = true, columnDefinition = "text")
    private String loginId;

    @Column(name = "password_hash", nullable = false, columnDefinition = "text")
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, columnDefinition = "text")
    private AccountRole role;

    /** MEMBER 계정이 대응하는 동맹원 cid. ADMIN 은 비어 있을 수 있다. */
    @Column(name = "cid", columnDefinition = "text")
    private String cid;

    @Column(name = "display_name", nullable = false, columnDefinition = "text")
    private String displayName;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "locked_until")
    private OffsetDateTime lockedUntil;

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected AppAccount() {
        // JPA 전용
    }

    public AppAccount(UUID allianceId, String loginId, String passwordHash, AccountRole role,
            String displayName) {
        this.allianceId = allianceId;
        this.loginId = loginId;
        this.passwordHash = passwordHash;
        this.role = role;
        this.displayName = displayName;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    public boolean isLocked() {
        return lockedUntil != null && lockedUntil.isAfter(OffsetDateTime.now());
    }

    public void recordFailure() {
        this.failedAttempts++;
        if (this.failedAttempts >= MAX_FAILED_ATTEMPTS) {
            this.lockedUntil = OffsetDateTime.now().plusMinutes(LOCK_MINUTES);
            this.failedAttempts = 0;
        }
    }

    public void recordSuccess() {
        this.failedAttempts = 0;
        this.lockedUntil = null;
        this.lastLoginAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getAllianceId() {
        return allianceId;
    }

    public void setAllianceId(UUID allianceId) {
        this.allianceId = allianceId;
    }

    public String getLoginId() {
        return loginId;
    }

    /** 해시값이므로 응답 DTO 에 절대 싣지 않는다. */
    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public AccountRole getRole() {
        return role;
    }

    public void setRole(AccountRole role) {
        this.role = role;
    }

    public String getCid() {
        return cid;
    }

    public void setCid(String cid) {
        this.cid = cid;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public OffsetDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public OffsetDateTime getLockedUntil() {
        return lockedUntil;
    }
}
