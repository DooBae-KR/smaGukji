package com.smagukji.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** 직원 혼잣말. 화면에서 말풍선으로 뜬다. */
@Entity
@Table(name = "agent_thought")
public class AgentThought {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "text", nullable = false, columnDefinition = "text")
    private String text;

    @Column(name = "position", nullable = false)
    private int position;

    protected AgentThought() {
        // JPA 전용
    }

    public UUID getId() {
        return id;
    }

    public String getText() {
        return text;
    }

    public int getPosition() {
        return position;
    }
}
