package com.smagukji.backend.web.integration;

import com.smagukji.backend.domain.AssetCategory;
import com.smagukji.backend.domain.AssetImage;
import com.smagukji.backend.domain.Buff;
import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.General;
import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.TacticCategory;
import com.smagukji.backend.repository.AssetImageRepository;
import com.smagukji.backend.repository.BuffRepository;
import com.smagukji.backend.repository.GeneralRepository;
import com.smagukji.backend.repository.TacticRepository;
import com.smagukji.backend.web.AssetImageController;
import com.smagukji.backend.web.ResourceNotFoundException;
import com.smagukji.backend.web.dto.BuffDto;
import com.smagukji.backend.web.dto.GeneralDto;
import com.smagukji.backend.web.dto.TacticDto;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 외부 시뮬레이션 프로젝트가 읽어가는 마스터 데이터.
 *
 * <p>시뮬레이션은 이 저장소 밖의 별도 서비스로 돌고, 장수·전법·버프 값은 여기(시트 →
 * Supabase)가 원본이다. 그쪽에서 표를 복사해 두면 시트를 고칠 때마다 두 곳이 어긋나므로,
 * <b>읽기 전용 창구</b> 를 하나 열어 그때그때 가져가게 한다.
 *
 * <p>사람이 쓰는 API 와 굳이 나눈 이유:
 * <ul>
 *   <li>인증이 다르다. 사람은 Supabase 토큰, 저쪽은 미리 나눠 가진 열쇠
 *       ({@link IntegrationApiKeyFilter}).</li>
 *   <li>읽기만 열려 있다. 열쇠가 새더라도 데이터가 바뀌지는 않는다.</li>
 *   <li>경로에 {@code v1} 을 박아 두어, 화면용 응답을 고치더라도 저쪽이 깨지지 않는다.</li>
 * </ul>
 *
 * <p>응답 자체는 화면이 쓰는 DTO 를 그대로 쓴다. 표현이 갈라지면 «시뮬레이션이 본 값» 과
 * «화면이 본 값» 이 달라지는데, 그게 이 창구를 만든 이유와 정면으로 어긋난다.
 */
@RestController
@RequestMapping("/api/integration/v1")
public class IntegrationController {

    private final GeneralRepository generals;
    private final TacticRepository tactics;
    private final BuffRepository buffs;
    private final AssetImageRepository assets;

    public IntegrationController(GeneralRepository generals, TacticRepository tactics,
            BuffRepository buffs, AssetImageRepository assets) {
        this.generals = generals;
        this.tactics = tactics;
        this.buffs = buffs;
        this.assets = assets;
    }

    /** 열쇠가 맞는지 확인용. 저쪽 배포 직후 연결만 먼저 확인할 수 있게 둔다. */
    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of("ok", true, "service", "smagukji", "version", "v1");
    }

    @GetMapping("/generals")
    @Transactional(readOnly = true)
    public List<GeneralDto> generals(@RequestParam(required = false) Faction faction) {
        return generalDtos(faction);
    }

    @GetMapping("/tactics")
    @Transactional(readOnly = true)
    public List<TacticDto> tactics(@RequestParam(required = false) TacticCategory category) {
        return tacticDtos(category);
    }

    @GetMapping("/buffs")
    @Transactional(readOnly = true)
    public List<BuffDto> buffs() {
        return buffDtos();
    }

    /**
     * 세 목록을 한 번에.
     *
     * <p>저쪽은 «지금 값 전부» 를 주기적으로 받아 캐시에 올리는 식으로 쓴다. 세 번 부르면
     * 그 사이에 시트 동기화가 끼어들어 반쯤 새 값, 반쯤 옛 값을 들고 갈 수 있다.
     * 한 트랜잭션에서 읽어 그런 틈을 없앤다.
     *
     * <p>{@code dataUpdatedAt} 은 세 표에서 가장 최근에 바뀐 시각이다. 저쪽이 이 값만 보고
     * «지난번 그대로면 넘어간다» 를 판단할 수 있다.
     */
    @GetMapping("/snapshot")
    @Transactional(readOnly = true)
    public Snapshot snapshot() {
        // 엔티티를 한 번만 읽는다. DTO 로 옮기고 나면 updatedAt 이 남지 않아,
        // 최신 시각은 여기서 함께 뽑아야 한다.
        List<General> generalRows = generals.findAllWithTactic();
        List<Tactic> tacticRows = tactics.findAllByOrderByNameAsc();
        List<Buff> buffRows = buffs.findAllByOrderByNameAsc();

        OffsetDateTime updated = Stream.of(
                        generalRows.stream().map(General::getUpdatedAt),
                        tacticRows.stream().map(Tactic::getUpdatedAt),
                        buffRows.stream().map(Buff::getUpdatedAt))
                .flatMap(s -> s)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);

        return new Snapshot(
                OffsetDateTime.now(),
                updated,
                new Counts(generalRows.size(), tacticRows.size(), buffRows.size()),
                generalRows.stream().map(GeneralDto::from).toList(),
                tacticRows.stream().map(TacticDto::from).toList(),
                buffRows.stream().map(BuffDto::from).toList());
    }

    /**
     * 카드 이미지.
     *
     * <p>DTO 의 {@code imageUrl} 은 사람용 경로({@code /api/assets/...})를 가리키는데,
     * 그쪽은 Supabase 토큰이 있어야 열린다. 열쇠로 들어온 호출이 이미지까지 받을 수 있게
     * 같은 이미지를 이 구간에도 낸다. 이름 규칙은 {@code imageUrl} 과 같다.
     */
    @GetMapping("/assets/{category}/{name}/image")
    public ResponseEntity<byte[]> image(@PathVariable AssetCategory category, @PathVariable String name) {
        AssetImage image = assets.findByCategoryAndName(category, name)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "이미지를 찾을 수 없습니다: %s/%s".formatted(category, name)));
        return AssetImageController.imageResponse(image);
    }

    public record Snapshot(
            OffsetDateTime generatedAt,
            OffsetDateTime dataUpdatedAt,
            Counts counts,
            List<GeneralDto> generals,
            List<TacticDto> tactics,
            List<BuffDto> buffs) {
    }

    public record Counts(int generals, int tactics, int buffs) {
    }

    private List<GeneralDto> generalDtos(Faction faction) {
        var rows = faction == null
                ? generals.findAllWithTactic()
                : generals.findAllByFactionWithTactic(faction);
        return rows.stream().map(GeneralDto::from).toList();
    }

    private List<TacticDto> tacticDtos(TacticCategory category) {
        var rows = category == null
                ? tactics.findAllByOrderByNameAsc()
                : tactics.findAllByCategoryOrderByNameAsc(category);
        return rows.stream().map(TacticDto::from).toList();
    }

    private List<BuffDto> buffDtos() {
        return buffs.findAllByOrderByNameAsc().stream().map(BuffDto::from).toList();
    }
}
