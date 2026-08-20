package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.Disposition;
import com.smagukji.backend.domain.General;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * 장수 응답. 이미지 URL 은 이름이 asset_image.name 과 같다는 점을 이용해 만든다.
 *
 * @param camp             진영 코드 (FRONT/BALANCE/BACK)
 * @param dispositions     성향 코드 목록. 한 장수가 여러 성향을 가질 수 있다
 * @param dispositionLabels 성향 한글 라벨. 프론트에서 코드→한글 표를 또 들고 있지 않게 함께 준다
 * @param statLevel        수치의 기준 레벨 (시트는 50)
 */
public record GeneralDto(
        UUID id,
        String name,
        String faction,
        String factionLabel,
        BigDecimal cost,
        String unitType,
        String unitTypeLabel,
        String camp,
        String campLabel,
        List<String> dispositions,
        List<String> dispositionLabels,
        BigDecimal might,
        BigDecimal intellect,
        BigDecimal leadership,
        BigDecimal initiative,
        int statLevel,
        String signatureTacticName,
        String note,
        String imageUrl) {

    public static GeneralDto from(General g) {
        List<String> codes = List.of(g.getDispositions());
        List<String> labels = Arrays.stream(g.getDispositions())
                // 알 수 없는 코드는 코드 그대로 보여준다. 조회가 죽는 것보다 낫다.
                .map(c -> Disposition.of(c).map(Disposition::label).orElse(c))
                .toList();

        return new GeneralDto(
                g.getId(),
                g.getName(),
                g.getFaction().name(),
                g.getFaction().label(),
                g.getCost(),
                g.getUnitType() == null ? null : g.getUnitType().name(),
                g.getUnitType() == null ? null : g.getUnitType().label(),
                g.getCamp() == null ? null : g.getCamp().name(),
                g.getCamp() == null ? null : g.getCamp().label(),
                codes,
                labels,
                g.getMight(),
                g.getIntellect(),
                g.getLeadership(),
                g.getInitiative(),
                g.getStatLevel(),
                g.getSignatureTactic() == null ? null : g.getSignatureTactic().getName(),
                g.getNote(),
                "/api/assets/GENERAL/" + g.getName() + "/image");
    }
}
