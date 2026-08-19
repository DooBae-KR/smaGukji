package com.smagukji.backend.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * AI 오피스 팀. 시뮬 / 인사 / 전략 / 기획 4개.
 *
 * <p>팀 문구를 DB 에 두는 이유는 화면 문구를 고치려고 재배포하지 않기 위해서다.
 */
@Entity
@Table(name = "agent_team")
public class AgentTeam {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "code", nullable = false, unique = true, columnDefinition = "text")
    private String code;

    @Column(name = "name", nullable = false, columnDefinition = "text")
    private String name;

    @Column(name = "icon", columnDefinition = "text")
    private String icon;

    @Column(name = "short_name", columnDefinition = "text")
    private String shortName;

    @Column(name = "task", nullable = false, columnDefinition = "text")
    private String task;

    @Column(name = "report", nullable = false, columnDefinition = "text")
    private String report;

    /** 이 팀이 담당하는 화면 경로. */
    @Column(name = "route", columnDefinition = "text")
    private String route;

    @Column(name = "position", nullable = false)
    private int position;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @jakarta.persistence.JoinColumn(name = "team_id")
    @OrderBy("position asc")
    private List<AgentStaff> staff = new ArrayList<>();

    protected AgentTeam() {
        // JPA 전용
    }

    public UUID getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getIcon() {
        return icon;
    }

    public String getShortName() {
        return shortName;
    }

    public String getTask() {
        return task;
    }

    public String getReport() {
        return report;
    }

    public String getRoute() {
        return route;
    }

    public int getPosition() {
        return position;
    }

    public List<AgentStaff> getStaff() {
        return staff;
    }
}
