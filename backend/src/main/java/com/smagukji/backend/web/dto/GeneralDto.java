package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.General;
import java.math.BigDecimal;
import java.util.UUID;

/** 장수 응답. 이미지 URL 은 이름이 asset_image.name 과 같다는 점을 이용해 만든다. */
public record GeneralDto(
        UUID id,
        String name,
        String faction,
        String factionLabel,
        BigDecimal cost,
        String unitType,
        String unitTypeLabel,
        Integer attack,
        Integer defense,
        Integer intelligence,
        Integer command,
        Integer speed,
        String signatureTacticName,
        String note,
        String imageUrl) {

    public static GeneralDto from(General g) {
        return new GeneralDto(
                g.getId(),
                g.getName(),
                g.getFaction().name(),
                g.getFaction().label(),
                g.getCost(),
                g.getUnitType() == null ? null : g.getUnitType().name(),
                g.getUnitType() == null ? null : g.getUnitType().label(),
                g.getAttack(),
                g.getDefense(),
                g.getIntelligence(),
                g.getCommand(),
                g.getSpeed(),
                g.getSignatureTactic() == null ? null : g.getSignatureTactic().getName(),
                g.getNote(),
                "/api/assets/GENERAL/" + g.getName() + "/image");
    }
}
