package com.smagukji.backend.service;

import com.smagukji.backend.config.AssetProperties;
import com.smagukji.backend.domain.AssetCategory;
import com.smagukji.backend.domain.AssetImage;
import com.smagukji.backend.repository.AssetImageRepository;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 로컬 폴더의 장수/전법 PNG 를 읽어 {@code asset_image} 테이블에 적재한다.
 *
 * <p>sha256 이 같으면 건너뛰므로 몇 번을 다시 실행해도 안전하다.
 */
@Service
public class AssetImageImportService {

    private static final Logger log = LoggerFactory.getLogger(AssetImageImportService.class);

    /** OneDrive/macOS 를 거친 한글 파일명은 NFD 로 분해되어 있을 수 있어 항상 NFC 로 정규화한다. */
    private static final Normalizer.Form NAME_FORM = Normalizer.Form.NFC;

    /** 하위 폴더를 몇 단계까지 훑을지. «장수/시즌2» 정도면 충분하고, 백업 사본까지 파고들 필요는 없다. */
    private static final int MAX_SCAN_DEPTH = 3;

    private final AssetImageRepository repository;
    private final AssetProperties properties;

    public AssetImageImportService(AssetImageRepository repository, AssetProperties properties) {
        this.repository = repository;
        this.properties = properties;
    }

    @Transactional
    public AssetImportResult importAll() {
        String configured = properties.sourceDir();
        if (configured == null || configured.isBlank()) {
            throw new IllegalStateException(
                    "app.assets.source-dir (환경변수 ASSET_SOURCE_DIR) 가 설정되지 않았습니다.");
        }

        Path root = Paths.get(configured);
        if (!Files.isDirectory(root)) {
            throw new IllegalStateException("원본 디렉터리를 찾을 수 없습니다: " + root.toAbsolutePath());
        }

        int inserted = 0;
        int updated = 0;
        int unchanged = 0;
        List<String> failures = new ArrayList<>();

        for (AssetCategory category : AssetCategory.values()) {
            Path dir = root.resolve(category.folderName());
            if (!Files.isDirectory(dir)) {
                failures.add("%s 폴더 없음: %s".formatted(category.folderName(), dir));
                continue;
            }

            for (Path file : listPngFiles(dir)) {
                try {
                    switch (upsert(category, file)) {
                        case INSERTED -> inserted++;
                        case UPDATED -> updated++;
                        case UNCHANGED -> unchanged++;
                    }
                } catch (IOException | RuntimeException e) {
                    log.warn("이미지 적재 실패: {}", file, e);
                    failures.add("%s: %s".formatted(file.getFileName(), e.getMessage()));
                }
            }
        }

        log.info("이미지 적재 완료 - 신규 {}, 갱신 {}, 변경없음 {}, 실패 {}",
                inserted, updated, unchanged, failures.size());
        return new AssetImportResult(inserted, updated, unchanged, failures);
    }

    private enum Outcome {
        INSERTED, UPDATED, UNCHANGED
    }

    private Outcome upsert(AssetCategory category, Path file) throws IOException {
        String fileName = normalize(file.getFileName().toString());
        String name = stripExtension(fileName);
        byte[] data = Files.readAllBytes(file);
        if (data.length == 0) {
            throw new IOException("빈 파일");
        }
        String sha256 = sha256Hex(data);

        if (repository.findUnchangedId(category, name, sha256).isPresent()) {
            return Outcome.UNCHANGED;
        }

        Optional<AssetImage> existing = repository.findByCategoryAndName(category, name);
        if (existing.isPresent()) {
            existing.get().replaceContent(fileName, "image/png", data, sha256);
            return Outcome.UPDATED;
        }

        repository.save(new AssetImage(category, name, fileName, "image/png", data, sha256));
        return Outcome.INSERTED;
    }

    /**
     * PNG 를 하위 폴더까지 찾는다.
     *
     * <p>카드를 «장수/시즌2» 처럼 묶어두는 경우가 있다. 예전에는 바로 아래만 훑어서
     * 그런 폴더의 카드가 통째로 빠졌고, 이미지 없는 장수가 생겼다.
     *
     * <p>깊이를 제한하는 이유는, 원본 폴더 아래에 백업 사본 같은 것이 섞여 있어도
     * 끝없이 파고들지 않게 하기 위해서다.
     */
    private static List<Path> listPngFiles(Path dir) {
        try (Stream<Path> stream = Files.walk(dir, MAX_SCAN_DEPTH)) {
            return stream.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".png"))
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("디렉터리를 읽을 수 없습니다: " + dir, e);
        }
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, NAME_FORM);
    }

    private static String stripExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    private static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 을 사용할 수 없습니다", e);
        }
    }
}
