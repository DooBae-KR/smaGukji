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
 * cid 에 붙는 마커. 버튼으로 켜고 끈다.
 *
 * <p>끌 때 행을 지우지 않고 {@code enabled} 만 false 로 둔다. 언제 누가 켰다 껐는지가
 * 나중에 설명 근거가 되기 때문이다.
 */
@Entity
@Table(name = "member_marker")
public class MemberMarker {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "alliance_id", nullable = false)
    private UUID allianceId;

    @Column(name = "cid", nullable = false, columnDefinition = "text")
    private String cid;

    @Enumerated(EnumType.STRING)
    @Column(name = "marker_type", nullable = false, columnDefinition = "text")
    private MarkerType markerType;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "updated_by", columnDefinition = "text")
    private String updatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected MemberMarker() {
        // JPA 전용
    }

    public MemberMarker(UUID allianceId, String cid, MarkerType markerType, boolean enabled,
            String updatedBy) {
        this.allianceId = allianceId;
        this.cid = cid;
        this.markerType = markerType;
        this.enabled = enabled;
        this.updatedBy = updatedBy;
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

    public void toggle(boolean enabled, String updatedBy) {
        this.enabled = enabled;
        this.updatedBy = updatedBy;
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

    public MarkerType getMarkerType() {
        return markerType;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
