package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.UnitType;
import java.math.BigDecimal;

/**
 * 장수 부분 수정. null 인 필드는 건드리지 않는다.
 *
 * <p>초기 시드에서 비어 있는 unitType 과 각 수치를 채우는 것이 주 용도다.
 */
public record GeneralPatch(
        Faction faction,
        BigDecimal cost,
        UnitType unitType,
        Integer attack,
        Integer defense,
        Integer intelligence,
        Integer command,
        Integer speed,
        String signatureTacticName,
        String note) {
}
