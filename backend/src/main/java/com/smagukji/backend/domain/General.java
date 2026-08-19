package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 장수.
 *
 * <p>name / faction / cost 는 카드 이미지에서 판독한 값이라 신뢰할 수 있다.
 * unitType 과 각 수치는 초기값이 null 이며 별도 입력이 필요하다.
 */
@Entity
@Table(name = "general")
public class General {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** asset_image.name 과 동일해야 카드 이미지가 연결된다. */
    @Column(name = "name", nullable = false, unique = true, columnDefinition = "text")
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "faction", nullable = false, columnDefinition = "text")
    private Faction faction;

    @Column(name = "cost", nullable = false, precision = 4, scale = 1)
    private BigDecimal cost;

    /** 카드 아이콘 판독 불가로 초기값 null. */
    @Enumerated(EnumType.STRING)
    @Column(name = "unit_type", columnDefinition = "text")
    private UnitType unitType;

    @Column(name = "rarity", columnDefinition = "text")
    private String rarity;

    @Column(name = "attack")
    private Integer attack;

    @Column(name = "defense")
    private Integer defense;

    @Column(name = "intelligence")
    private Integer intelligence;

    @Column(name = "command")
    private Integer command;

    @Column(name = "speed")
    private Integer speed;

    @Column(name = "note", columnDefinition = "text")
    private String note;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "signature_tactic_id")
    private Tactic signatureTactic;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected General() {
        // JPA 전용
    }

    public General(String name, Faction faction, BigDecimal cost) {
        this.name = name;
        this.faction = faction;
        this.cost = cost;
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

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Faction getFaction() {
        return faction;
    }

    public void setFaction(Faction faction) {
        this.faction = faction;
    }

    public BigDecimal getCost() {
        return cost;
    }

    public void setCost(BigDecimal cost) {
        this.cost = cost;
    }

    public UnitType getUnitType() {
        return unitType;
    }

    public void setUnitType(UnitType unitType) {
        this.unitType = unitType;
    }

    public String getRarity() {
        return rarity;
    }

    public void setRarity(String rarity) {
        this.rarity = rarity;
    }

    public Integer getAttack() {
        return attack;
    }

    public void setAttack(Integer attack) {
        this.attack = attack;
    }

    public Integer getDefense() {
        return defense;
    }

    public void setDefense(Integer defense) {
        this.defense = defense;
    }

    public Integer getIntelligence() {
        return intelligence;
    }

    public void setIntelligence(Integer intelligence) {
        this.intelligence = intelligence;
    }

    public Integer getCommand() {
        return command;
    }

    public void setCommand(Integer command) {
        this.command = command;
    }

    public Integer getSpeed() {
        return speed;
    }

    public void setSpeed(Integer speed) {
        this.speed = speed;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Tactic getSignatureTactic() {
        return signatureTactic;
    }

    public void setSignatureTactic(Tactic signatureTactic) {
        this.signatureTactic = signatureTactic;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
