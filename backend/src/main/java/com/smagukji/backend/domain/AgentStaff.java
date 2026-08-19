package com.smagukji.backend.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 팀 소속 직원. 팀당 LEAD 는 정확히 1명(부분 유니크 인덱스로 강제). */
@Entity
@Table(name = "agent_staff")
public class AgentStaff {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false, columnDefinition = "text")
    private String name;

    @Column(name = "role", nullable = false, columnDefinition = "text")
    private String role;

    @Column(name = "rank", nullable = false, columnDefinition = "text")
    private String rank;

    @Column(name = "hair_color", nullable = false, columnDefinition = "text")
    private String hairColor;

    @Column(name = "shirt_color", nullable = false, columnDefinition = "text")
    private String shirtColor;

    @Column(name = "accent_color", nullable = false, columnDefinition = "text")
    private String accentColor;

    @Column(name = "position", nullable = false)
    private int position;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "staff_id")
    @OrderBy("position asc")
    private List<AgentThought> thoughts = new ArrayList<>();

    protected AgentStaff() {
        // JPA 전용
    }

    public boolean isLead() {
        return "LEAD".equals(rank);
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getRole() {
        return role;
    }

    public String getRank() {
        return rank;
    }

    public String getHairColor() {
        return hairColor;
    }

    public String getShirtColor() {
        return shirtColor;
    }

    public String getAccentColor() {
        return accentColor;
    }

    public int getPosition() {
        return position;
    }

    public List<AgentThought> getThoughts() {
        return thoughts;
    }
}
