package com.smagukji.backend.web.dto;

import com.smagukji.backend.domain.Buff;
import java.util.List;
import java.util.UUID;

/**
 * 버프·이상 상태 응답.
 *
 * <p>전법 설명에 나오는 «회심»·«관통»·«침묵» 같은 말의 뜻이다. 시뮬레이션이 효과를
 * 해석하려면 이 사전이 있어야 해서 연동 API 로 함께 내보낸다.
 */
public record BuffDto(UUID id, String name, List<String> categories, String description) {

    public static BuffDto from(Buff b) {
        return new BuffDto(b.getId(), b.getName(), List.of(b.getCategories()), b.getDescription());
    }
}
