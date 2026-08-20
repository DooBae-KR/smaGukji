package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.Team;
import com.smagukji.backend.domain.TeamSlot;
import com.smagukji.backend.domain.TeamSlotTactic;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** 부대 응답. */
public record TeamDto(
        UUID id,
        String name,
        String description,
        List<SlotDto> slots,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public record SlotDto(
            UUID id,
            int position,
            boolean leader,
            GeneralDto general,
            List<TacticDto> tactics) {
    }

    public static TeamDto from(Team team) {
        List<SlotDto> slots = team.getSlots().stream()
                .map(TeamDto::toSlot)
                .toList();
        return new TeamDto(team.getId(), team.getName(), team.getDescription(),
                slots, team.getCreatedAt(), team.getUpdatedAt());
    }

    private static SlotDto toSlot(TeamSlot slot) {
        List<TacticDto> tactics = slot.getTactics().stream()
                .map(TeamSlotTactic::getTactic)
                .map(TacticDto::from)
                .toList();
        return new SlotDto(slot.getId(), slot.getPosition(), slot.isLeader(),
                GeneralDto.from(slot.getGeneral()), tactics);
    }
}
