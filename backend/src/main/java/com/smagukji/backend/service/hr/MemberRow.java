package com.smagukji.backend.service.hr;

import java.util.List;

/**
 * 인사팀 그리드의 한 행. 주차 스냅샷 + cid 마커 + 주의 이력을 합친 것.
 *
 * @param markers          켜져 있는 마커 코드들 (CAUTION / GILJAK / ACTIVE)
 * @param openCautionCount 해제되지 않은 주의 건수
 * @param latestCaution    가장 최근 주의 사유. 없으면 null
 */
public record MemberRow(
        String cid,
        String memberName,
        String job,
        String teamGroup,
        String position,
        Long prosperity,
        Long weeklyMerit,
        Long weeklyContribution,
        String garrison,
        Integer weeklySiegeCount,
        List<String> markers,
        long openCautionCount,
        String latestCaution) {

    public boolean hasMarker(String code) {
        return markers.contains(code);
    }
}
