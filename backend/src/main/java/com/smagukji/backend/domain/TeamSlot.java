package com.smagukji.backend.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 부대 내 장수 한 명. position 1 이 대장, 2/3 이 부장이다. */
@Entity
@Table(name = "team_slot")
public class TeamSlot {

    public static final int MAX_TACTICS = 2;
    public static final int LEADER_POSITION = 1;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(name = "position", nullable = false)
    private int position;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "general_id", nullable = false)
    private General general;

    @OneToMany(mappedBy = "slot", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position asc")
    private List<TeamSlotTactic> tactics = new ArrayList<>();

    protected TeamSlot() {
        // JPA 전용
    }

    public TeamSlot(int position, General general) {
        this.position = position;
        this.general = general;
    }

    void assignTo(Team team) {
        this.team = team;
    }

    public void addTactic(TeamSlotTactic tactic) {
        if (tactics.size() >= MAX_TACTICS) {
            throw new IllegalArgumentException(
                    "장수 한 명당 전법은 최대 " + MAX_TACTICS + "개까지 장착할 수 있습니다.");
        }
        tactic.assignTo(this);
        tactics.add(tactic);
    }

    public boolean isLeader() {
        return position == LEADER_POSITION;
    }

    public UUID getId() {
        return id;
    }

    public Team getTeam() {
        return team;
    }

    public int getPosition() {
        return position;
    }

    public General getGeneral() {
        return general;
    }

    public List<TeamSlotTactic> getTactics() {
        return tactics;
    }
}
