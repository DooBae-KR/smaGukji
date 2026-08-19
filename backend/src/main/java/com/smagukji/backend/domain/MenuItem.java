package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 화면 메뉴. 인사팀 외에는 기본이 관리자 전용이다. */
@Entity
@Table(name = "menu_item")
public class MenuItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "code", nullable = false, unique = true, columnDefinition = "text")
    private String code;

    @Column(name = "label", nullable = false, columnDefinition = "text")
    private String label;

    @Column(name = "route", nullable = false, unique = true, columnDefinition = "text")
    private String route;

    @Column(name = "icon", columnDefinition = "text")
    private String icon;

    /** 이 메뉴를 볼 수 있는 역할 목록. 예: {ADMIN, OFFICER} */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    @Column(name = "allowed_roles", nullable = false, columnDefinition = "text[]")
    private String[] allowedRoles = {"ADMIN"};

    /** false 면 관리자에게도 숨긴다. */
    @Column(name = "visible", nullable = false)
    private boolean visible = true;

    @Column(name = "position", nullable = false)
    private int position;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected MenuItem() {
        // JPA 전용
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

    /**
     * 이 역할에게 메뉴를 보여줄지.
     *
     * @param role 로그인하지 않았으면 null
     */
    public boolean isVisibleTo(AccountRole role) {
        if (!visible || role == null) {
            return false;
        }
        for (String allowed : allowedRoles) {
            if (role.name().equals(allowed)) {
                return true;
            }
        }
        return false;
    }

    public UUID getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getRoute() {
        return route;
    }

    public String getIcon() {
        return icon;
    }

    public String[] getAllowedRoles() {
        return allowedRoles == null ? new String[0] : allowedRoles.clone();
    }

    public void setAllowedRoles(String[] allowedRoles) {
        if (allowedRoles == null || allowedRoles.length == 0) {
            throw new IllegalArgumentException("메뉴에는 최소 한 개의 역할이 필요합니다.");
        }
        this.allowedRoles = allowedRoles.clone();
    }

    public boolean isVisible() {
        return visible;
    }

    public void setVisible(boolean visible) {
        this.visible = visible;
    }

    public int getPosition() {
        return position;
    }
}
