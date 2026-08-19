package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.Tactic;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** 전법 응답. */
public record TacticDto(
        UUID id,
        String name,
        String category,
        String categoryLabel,
        String abilityType,
        String abilityTypeLabel,
        String quality,
        String qualityLabel,
        BigDecimal triggerRate,
        Integer targetCount,
        String effectText,
        List<String> roleTags,
        String source,
        boolean dataComplete,
        String imageUrl) {

    public static TacticDto from(Tactic t) {
        return new TacticDto(
                t.getId(),
                t.getName(),
                t.getCategory() == null ? null : t.getCategory().name(),
                t.getCategory() == null ? null : t.getCategory().label(),
                t.getAbilityType() == null ? null : t.getAbilityType().name(),
                t.getAbilityType() == null ? null : t.getAbilityType().label(),
                t.getQuality() == null ? null : t.getQuality().name(),
                t.getQuality() == null ? null : t.getQuality().label(),
                t.getTriggerRate(),
                t.getTargetCount(),
                t.getEffectText(),
                List.of(t.getRoleTags()),
                t.getSource() == null ? null : t.getSource().name(),
                t.perTurnTriggerProbability() != null,
                "/api/assets/TACTIC/" + t.getName() + "/image");
    }
}
