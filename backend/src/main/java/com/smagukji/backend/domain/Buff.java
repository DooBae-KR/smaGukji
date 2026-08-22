package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 버프·이상 상태 사전.
 *
 * <p>전법 설명에 «회심», «관통», «침묵» 같은 말이 그대로 나오는데 그 뜻은 따로 적혀 있지
 * 않았다. 시트의 «버프» 탭에서 읽어와 여기 담는다.
 */
@Entity
@Table(name = "buff")
public class Buff {

    @Id
    @GeneratedValue
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    /** 한 버프가 여러 분류에 속한다(예: 침묵은 «이상 상태»이자 «제어 상태»). */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    @Column(name = "categories", nullable = false, columnDefinition = "text[]")
    private String[] categories = new String[0];

    @Column(name = "description", nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected Buff() {
        // JPA 전용
    }

    public Buff(String name, String description) {
        this.name = name;
        this.description = description;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String[] getCategories() {
        return categories == null ? new String[0] : categories.clone();
    }

    public void setCategories(String[] categories) {
        this.categories = categories == null ? new String[0] : categories.clone();
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
