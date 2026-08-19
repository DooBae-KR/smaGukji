package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * MemberWeek&lt;YYYYMMDD&gt; 시트의 한 행.
 *
 * <p>cid 는 숫자처럼 보이지만 앞자리 0 이 사라지면 안 되므로 문자열로 다룬다.
 */
@Entity
@Table(name = "member_week")
public class MemberWeek {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "alliance_id", nullable = false)
    private UUID allianceId;

    @Column(name = "snapshot_date", nullable = false)
    private LocalDate snapshotDate;

    /** 시트의 «캐릭터 ID» */
    @Column(name = "cid", nullable = false, columnDefinition = "text")
    private String cid;

    /** 시트의 «멤버» */
    @Column(name = "member_name", nullable = false, columnDefinition = "text")
    private String memberName;

    /** 시트의 «직업» */
    @Column(name = "job", columnDefinition = "text")
    private String job;

    /** 시트의 «조별» */
    @Column(name = "team_group", columnDefinition = "text")
    private String teamGroup;

    /** 시트의 «직위» */
    @Column(name = "position", columnDefinition = "text")
    private String position;

    /** 시트의 «번영» */
    @Column(name = "prosperity")
    private Long prosperity;

    /** 시트의 «주간 무훈» */
    @Column(name = "weekly_merit")
    private Long weeklyMerit;

    /** 시트의 «주간 공헌» */
    @Column(name = "weekly_contribution")
    private Long weeklyContribution;

    /** 시트의 «주둔지» 예: (500, 1410) */
    @Column(name = "garrison", columnDefinition = "text")
    private String garrison;

    /** 시트의 «주 공성 횟수» */
    @Column(name = "weekly_siege_count")
    private Integer weeklySiegeCount;

    @Column(name = "source_file", columnDefinition = "text")
    private String sourceFile;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected MemberWeek() {
        // JPA 전용
    }

    public MemberWeek(UUID allianceId, LocalDate snapshotDate, String cid, String memberName) {
        this.allianceId = allianceId;
        this.snapshotDate = snapshotDate;
        this.cid = cid;
        this.memberName = memberName;
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

    /** 같은 주차 재업로드 시 내용을 갈아끼운다. */
    public void replaceWith(MemberWeek other) {
        this.memberName = other.memberName;
        this.job = other.job;
        this.teamGroup = other.teamGroup;
        this.position = other.position;
        this.prosperity = other.prosperity;
        this.weeklyMerit = other.weeklyMerit;
        this.weeklyContribution = other.weeklyContribution;
        this.garrison = other.garrison;
        this.weeklySiegeCount = other.weeklySiegeCount;
        this.sourceFile = other.sourceFile;
    }

    public UUID getId() {
        return id;
    }

    public UUID getAllianceId() {
        return allianceId;
    }

    public LocalDate getSnapshotDate() {
        return snapshotDate;
    }

    public String getCid() {
        return cid;
    }

    public String getMemberName() {
        return memberName;
    }

    public void setMemberName(String memberName) {
        this.memberName = memberName;
    }

    public String getJob() {
        return job;
    }

    public void setJob(String job) {
        this.job = job;
    }

    public String getTeamGroup() {
        return teamGroup;
    }

    public void setTeamGroup(String teamGroup) {
        this.teamGroup = teamGroup;
    }

    public String getPosition() {
        return position;
    }

    public void setPosition(String position) {
        this.position = position;
    }

    public Long getProsperity() {
        return prosperity;
    }

    public void setProsperity(Long prosperity) {
        this.prosperity = prosperity;
    }

    public Long getWeeklyMerit() {
        return weeklyMerit;
    }

    public void setWeeklyMerit(Long weeklyMerit) {
        this.weeklyMerit = weeklyMerit;
    }

    public Long getWeeklyContribution() {
        return weeklyContribution;
    }

    public void setWeeklyContribution(Long weeklyContribution) {
        this.weeklyContribution = weeklyContribution;
    }

    public String getGarrison() {
        return garrison;
    }

    public void setGarrison(String garrison) {
        this.garrison = garrison;
    }

    public Integer getWeeklySiegeCount() {
        return weeklySiegeCount;
    }

    public void setWeeklySiegeCount(Integer weeklySiegeCount) {
        this.weeklySiegeCount = weeklySiegeCount;
    }

    public String getSourceFile() {
        return sourceFile;
    }

    public void setSourceFile(String sourceFile) {
        this.sourceFile = sourceFile;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
