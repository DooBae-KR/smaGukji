package com.smagukji.backend.domain;

/**
 * 계정 역할. DB 의 app_account.role 체크 제약과 값이 일치해야 한다.
 *
 * <p>권한 구분
 * <ul>
 *   <li>{@link #ADMIN} 관리자 — 메뉴 권한, 계정 관리, 그리고 아래 전부</li>
 *   <li>{@link #OFFICER} 간부진 — 인사 탭 관리(동맹원·마커·주의·시트 적재)만</li>
 *   <li>{@link #MEMBER} 동맹원 — 시뮬레이션만</li>
 * </ul>
 */
public enum AccountRole {

    ADMIN("관리자"),
    OFFICER("간부진"),
    MEMBER("동맹원");

    private final String label;

    AccountRole(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 메뉴 노출 설정과 계정 관리 권한. */
    public boolean canManageSystem() {
        return this == ADMIN;
    }

    /** 인사 탭(동맹원 그리드·마커·주의·시트 적재) 권한. */
    public boolean canManageHr() {
        return this == ADMIN || this == OFFICER;
    }

    /** 시뮬레이션 사용 권한. 모든 역할이 가진다. */
    public boolean canSimulate() {
        return true;
    }
}
