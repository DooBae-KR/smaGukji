package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 주의 사유. 주의 마커를 켤 때 모달에서 입력한다. 한 cid 에 여러 건 쌓인다. */
@Entity
@Table(name = "caution_note")
public class CautionNote {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "alliance_id", nullable = false)
    private UUID allianceId;

    @Column(name = "cid", nullable = false, columnDefinition = "text")
    private String cid;

    @Column(name = "reason", nullable = false, columnDefinition = "text")
    private String reason;

    @Column(name = "created_by", columnDefinition = "text")
    private String createdBy;

    @Column(name = "resolved", nullable = false)
    private boolean resolved;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected CautionNote() {
        // JPA 전용
    }

    public CautionNote(UUID allianceId, String cid, String reason, String createdBy) {
        this.allianceId = allianceId;
        this.cid = cid;
        this.reason = reason;
        this.createdBy = createdBy;
    }

    @PrePersist
    void onCreate() {
        this.createdAt = OffsetDateTime.now();
    }

    /** 지우지 않고 해제만 한다. 기록이 남아야 나중에 설명이 된다. */
    public void resolve() {
        this.resolved = true;
        this.resolvedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getAllianceId() {
        return allianceId;
    }

    public String getCid() {
        return cid;
    }

    public String getReason() {
        return reason;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public boolean isResolved() {
        return resolved;
    }

    public OffsetDateTime getResolvedAt() {
        return resolvedAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
