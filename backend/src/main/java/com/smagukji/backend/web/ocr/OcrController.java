package com.smagukji.backend.web.ocr;

import com.smagukji.backend.service.ocr.NvidiaOcrService;
import java.io.IOException;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 전보 스크린샷 → 텍스트.
 *
 * <p>이미지를 «턴별 전법 발동» 으로 나누는 규칙(parse.ts)은 프론트에 두고, 여기서는
 * 이미지에서 글자를 뽑아내는 일만 한다. 그 규칙을 바꿀 때마다 서버를 다시 배포할
 * 필요가 없게 하기 위해서다.
 *
 * <p>로그인만 되어 있으면 누구나 쓴다({@code /api/**} 는 인증만 요구). 시뮬레이션을
 * 검증하는 용도라 동맹원(MEMBER)도 편성 화면과 같은 자격으로 쓸 수 있어야 한다.
 */
@RestController
@RequestMapping("/api/ocr")
public class OcrController {

    /** 20MB 인데도 여기서 한 번 더 자른다. 전보 한 장이 몇 MB 를 넘을 이유가 없다. */
    private static final long MAX_IMAGE_BYTES = 8L * 1024 * 1024;

    private final NvidiaOcrService ocrService;

    public OcrController(NvidiaOcrService ocrService) {
        this.ocrService = ocrService;
    }

    public record BattleReportText(String text) {
    }

    @PostMapping(value = "/battle-report", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BattleReportText battleReport(@RequestPart("image") MultipartFile image)
            throws IOException, InterruptedException {
        if (image.isEmpty()) {
            throw new IllegalArgumentException("빈 이미지입니다.");
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new IllegalArgumentException("이미지가 너무 큽니다 (%dMB 이하).".formatted(
                    MAX_IMAGE_BYTES / (1024 * 1024)));
        }
        return new BattleReportText(ocrService.extractText(image));
    }
}
