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

    /** 진영(배치). 세력과는 다른 축이다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "camp", columnDefinition = "text")
    private Camp camp;

    /** 성향. 한 장수가 여러 성향을 가질 수 있어 배열이다. */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    @Column(name = "dispositions", nullable = false, columnDefinition = "text[]")
    private String[] dispositions = new String[0];

    /** 무력 (stat_level 기준). 시트 값이 .5 단위라 정수로 담을 수 없다. */
    @Column(name = "might", precision = 6, scale = 1)
    private BigDecimal might;

    /** 지력 */
    @Column(name = "intellect", precision = 6, scale = 1)
    private BigDecimal intellect;

    /** 통솔 */
    @Column(name = "leadership", precision = 6, scale = 1)
    private BigDecimal leadership;

    /** 선공 */
    @Column(name = "initiative", precision = 6, scale = 1)
    private BigDecimal initiative;

    /** 위 수치의 기준 레벨. 시트는 50렙 기준. */
    @Column(name = "stat_level", nullable = false)
    private int statLevel = 50;

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

    public Camp getCamp() {
        return camp;
    }

    public void setCamp(Camp camp) {
        this.camp = camp;
    }

    public String[] getDispositions() {
        return dispositions == null ? new String[0] : dispositions.clone();
    }

    public void setDispositions(String[] dispositions) {
        this.dispositions = dispositions == null ? new String[0] : dispositions.clone();
    }

    public BigDecimal getMight() {
        return might;
    }

    public void setMight(BigDecimal might) {
        this.might = might;
    }

    public BigDecimal getIntellect() {
        return intellect;
    }

    public void setIntellect(BigDecimal intellect) {
        this.intellect = intellect;
    }

    public BigDecimal getLeadership() {
        return leadership;
    }

    public void setLeadership(BigDecimal leadership) {
        this.leadership = leadership;
    }

    public BigDecimal getInitiative() {
        return initiative;
    }

    public void setInitiative(BigDecimal initiative) {
        this.initiative = initiative;
    }

    public int getStatLevel() {
        return statLevel;
    }

    public void setStatLevel(int statLevel) {
        this.statLevel = statLevel;
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
