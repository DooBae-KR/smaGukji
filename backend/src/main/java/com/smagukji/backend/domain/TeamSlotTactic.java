package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;

/** 슬롯에 장착한 전법. */
@Entity
@Table(name = "team_slot_tactic")
public class TeamSlotTactic {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "slot_id", nullable = false)
    private TeamSlot slot;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "tactic_id", nullable = false)
    private Tactic tactic;

    @Column(name = "position", nullable = false)
    private int position;

    protected TeamSlotTactic() {
        // JPA 전용
    }

    public TeamSlotTactic(int position, Tactic tactic) {
        this.position = position;
        this.tactic = tactic;
    }

    void assignTo(TeamSlot slot) {
        this.slot = slot;
    }

    public UUID getId() {
        return id;
    }

    public TeamSlot getSlot() {
        return slot;
    }

    public Tactic getTactic() {
        return tactic;
    }

    public int getPosition() {
        return position;
    }
}
