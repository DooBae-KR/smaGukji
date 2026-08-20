package com.smagukji.backend.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 부대 생성/수정 요청.
 *
 * <p>장수와 전법은 이름으로 지정한다. 이름이 유니크하고 카드 이미지 파일명과도 같아서
 * UUID 보다 다루기 쉽다.
 */
public record TeamRequest(
        @NotBlank(message = "부대 이름은 필수입니다")
        String name,

        String description,


        @Valid
        @Size(max = 3, message = "부대에는 장수를 최대 3명까지 넣을 수 있습니다")
        List<SlotRequest> slots) {

    public record SlotRequest(
            @Min(value = 1, message = "슬롯 위치는 1~3 입니다")
            @Max(value = 3, message = "슬롯 위치는 1~3 입니다")
            int position,

            @NotBlank(message = "장수 이름은 필수입니다")
            String generalName,

            @Size(max = 2, message = "장수 한 명당 전법은 최대 2개입니다")
            List<String> tacticNames) {
    }
}
