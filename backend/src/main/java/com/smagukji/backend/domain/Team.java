package com.smagukji.backend.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 부대. 장수 최대 3명으로 구성한다. */
@Entity
@Table(name = "team")
public class Team {

    public static final int MAX_SLOTS = 3;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_id")
    private UUID ownerId;

    @Column(name = "name", nullable = false, columnDefinition = "text")
    private String name;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "cost_limit", nullable = false, precision = 4, scale = 1)
    private BigDecimal costLimit = new BigDecimal("15.0");

    @OneToMany(mappedBy = "team", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position asc")
    private List<TeamSlot> slots = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected Team() {
        // JPA 전용
    }

    public Team(String name, BigDecimal costLimit) {
        this.name = name;
        if (costLimit != null) {
            this.costLimit = costLimit;
        }
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

    public void clearSlots() {
        slots.clear();
    }

    public void addSlot(TeamSlot slot) {
        if (slots.size() >= MAX_SLOTS) {
            throw new IllegalArgumentException("부대에는 장수를 최대 " + MAX_SLOTS + "명까지 넣을 수 있습니다.");
        }
        slot.assignTo(this);
        slots.add(slot);
    }

    public UUID getId() {
        return id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(UUID ownerId) {
        this.ownerId = ownerId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getCostLimit() {
        return costLimit;
    }

    public void setCostLimit(BigDecimal costLimit) {
        this.costLimit = costLimit;
    }

    public List<TeamSlot> getSlots() {
        return slots;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
