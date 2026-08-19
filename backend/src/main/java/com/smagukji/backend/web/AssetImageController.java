package com.smagukji.backend.web;

import com.smagukji.backend.domain.AssetCategory;
import com.smagukji.backend.domain.AssetImage;
import com.smagukji.backend.repository.AssetImageRepository;
import com.smagukji.backend.repository.AssetImageSummary;
import com.smagukji.backend.service.AssetImageImportService;
import com.smagukji.backend.service.AssetImportResult;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/assets")
public class AssetImageController {

    private final AssetImageRepository repository;
    private final AssetImageImportService importService;

    public AssetImageController(AssetImageRepository repository, AssetImageImportService importService) {
        this.repository = repository;
        this.importService = importService;
    }

    /** 이미지 목록. bytea 본문은 포함하지 않는다. */
    @GetMapping
    public List<AssetImageSummary> list(@RequestParam(required = false) AssetCategory category) {
        return category == null
                ? repository.findAllByOrderByCategoryAscNameAsc()
                : repository.findAllByCategoryOrderByNameAsc(category);
    }

    @GetMapping("/count")
    public Map<String, Long> count() {
        return Map.of(
                AssetCategory.GENERAL.name(), repository.countByCategory(AssetCategory.GENERAL),
                AssetCategory.TACTIC.name(), repository.countByCategory(AssetCategory.TACTIC));
    }

    /** PNG 원본 바이트. sha256 을 ETag 로 사용해 재요청을 304 로 끊는다. */
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable UUID id) {
        AssetImage image = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("이미지를 찾을 수 없습니다: " + id));
        return imageResponse(image);
    }

    /** 이름으로 바로 접근. 예: /api/assets/GENERAL/관우/image */
    @GetMapping("/{category}/{name}/image")
    public ResponseEntity<byte[]> imageByName(@PathVariable AssetCategory category, @PathVariable String name) {
        AssetImage image = repository.findByCategoryAndName(category, name)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "이미지를 찾을 수 없습니다: %s/%s".formatted(category, name)));
        return imageResponse(image);
    }

    /** 로컬 폴더에서 다시 적재한다. sha256 이 같은 파일은 건너뛴다. */
    @PostMapping("/import")
    public AssetImportResult importAssets() {
        return importService.importAll();
    }

    private static ResponseEntity<byte[]> imageResponse(AssetImage image) {
        if (image.getData() == null) {
            return ResponseEntity.status(302)
                    .header("Location", image.getExternalUrl())
                    .build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.getContentType()))
                .eTag("\"" + image.getSha256() + "\"")
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .body(image.getData());
    }
}
