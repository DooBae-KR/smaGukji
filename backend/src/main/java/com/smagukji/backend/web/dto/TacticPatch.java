package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.AbilityType;
import com.smagukji.backend.domain.TacticCategory;
import com.smagukji.backend.domain.TacticQuality;
import com.smagukji.backend.domain.TacticSource;
import java.math.BigDecimal;
import java.util.List;

/**
 * 전법 부분 수정. null 인 필드는 건드리지 않는다.
 *
 * <p>초기 시드는 이름만 있으므로 여기서 분류/발동확률 등을 채워야 시뮬레이션이 동작한다.
 */
public record TacticPatch(
        TacticCategory category,
        AbilityType abilityType,
        TacticQuality quality,
        BigDecimal triggerRate,
        Integer targetCount,
        String effectText,
        List<String> roleTags,
        TacticSource source) {
}
