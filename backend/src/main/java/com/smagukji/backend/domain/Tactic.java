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
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 전법.
 *
 * <p>이름을 제외한 대부분의 필드는 초기 시드에서 비어 있다. CSV 임포트나 PATCH API 로 채운다.
 * 분석 로직은 null 을 '미입력'으로 처리하고 해당 항목을 건너뛴다.
 */
@Entity
@Table(name = "tactic")
public class Tactic {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** asset_image.name 과 동일해야 카드 이미지가 연결된다. */
    @Column(name = "name", nullable = false, unique = true, columnDefinition = "text")
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", columnDefinition = "text")
    private TacticCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "ability_type", columnDefinition = "text")
    private AbilityType abilityType;

    @Enumerated(EnumType.STRING)
    @Column(name = "quality", columnDefinition = "text")
    private TacticQuality quality;

    /** 발동확률 0~100. null 이면 미입력. */
    @Column(name = "trigger_rate", precision = 5, scale = 2)
    private BigDecimal triggerRate;

    @Column(name = "target_count")
    private Integer targetCount;

    @Column(name = "effect_text", columnDefinition = "text")
    private String effectText;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "role_tags", columnDefinition = "text[]")
    private String[] roleTags = new String[0];

    @Enumerated(EnumType.STRING)
    @Column(name = "source", columnDefinition = "text")
    private TacticSource source;

    /**
     * 등급. LEGEND 전설 / HERO 영웅.
     *
     * <p>enum 이 아니라 문자열인 이유: 장수와 같은 값 집합이고 DB 의 체크 제약이 이미
     * 강제한다. 두 곳에 enum 을 두면 한쪽만 늘어났을 때 조용히 어긋난다.
     */
    @Column(name = "rarity", columnDefinition = "text")
    private String rarity;

    /** 시즌 전법 번호. 카드에 «S» 가 붙는 전법. 비어 있으면 시즌 구분이 없는 기본 전법이다. */
    @Column(name = "season")
    private Integer season;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected Tactic() {
        // JPA 전용
    }

    public Tactic(String name) {
        this.name = name;
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
     * 매 턴 발동 확률. 확률 판정을 거치지 않는 분류(지휘/패시브 등)는 1.0,
     * 발동확률이 미입력이면 빈 값을 뜻하는 -1 대신 null 처리를 위해 {@code null} 을 돌려준다.
     */
    public Double perTurnTriggerProbability() {
        if (category == null) {
            return null;
        }
        if (!category.triggersByChance()) {
            return 1.0;
        }
        return triggerRate == null ? null : triggerRate.doubleValue() / 100.0;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public TacticCategory getCategory() {
        return category;
    }

    public void setCategory(TacticCategory category) {
        this.category = category;
    }

    public AbilityType getAbilityType() {
        return abilityType;
    }

    public void setAbilityType(AbilityType abilityType) {
        this.abilityType = abilityType;
    }

    public TacticQuality getQuality() {
        return quality;
    }

    public void setQuality(TacticQuality quality) {
        this.quality = quality;
    }

    public BigDecimal getTriggerRate() {
        return triggerRate;
    }

    public void setTriggerRate(BigDecimal triggerRate) {
        this.triggerRate = triggerRate;
    }

    public Integer getTargetCount() {
        return targetCount;
    }

    public void setTargetCount(Integer targetCount) {
        this.targetCount = targetCount;
    }

    public String getEffectText() {
        return effectText;
    }

    public void setEffectText(String effectText) {
        this.effectText = effectText;
    }

    public String[] getRoleTags() {
        return roleTags == null ? new String[0] : roleTags.clone();
    }

    public void setRoleTags(String[] roleTags) {
        this.roleTags = roleTags == null ? new String[0] : roleTags.clone();
    }

    public String getRarity() {
        return rarity;
    }

    public void setRarity(String rarity) {
        this.rarity = rarity;
    }

    public Integer getSeason() {
        return season;
    }

    public void setSeason(Integer season) {
        this.season = season;
    }

    public TacticSource getSource() {
        return source;
    }

    public void setSource(TacticSource source) {
        this.source = source;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
