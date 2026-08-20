package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.Camp;
import com.smagukji.backend.domain.Disposition;
import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.UnitType;
import java.math.BigDecimal;
import java.util.List;

/**
 * 장수 부분 수정. null 인 필드는 건드리지 않는다.
 *
 * <p>시트에 아직 없는 장수의 분류·수치를 채우는 것이 주 용도다.
 */
public record GeneralPatch(
        Faction faction,
        BigDecimal cost,
        UnitType unitType,
        Camp camp,
        List<Disposition> dispositions,
        BigDecimal might,
        BigDecimal intellect,
        BigDecimal leadership,
        BigDecimal initiative,
        Integer statLevel,
        String signatureTacticName,
        String note) {
}
