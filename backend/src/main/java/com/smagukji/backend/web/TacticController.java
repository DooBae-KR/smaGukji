package com.smagukji.backend.web;

import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.TacticCategory;
import com.smagukji.backend.repository.TacticRepository;
import com.smagukji.backend.service.MasterDataImportService;
import com.smagukji.backend.service.MasterDataImportService.ImportReport;
import com.smagukji.backend.web.dto.TacticDto;
import com.smagukji.backend.web.dto.TacticPatch;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tactics")
public class TacticController {

    private final TacticRepository repository;
    private final MasterDataImportService importService;

    public TacticController(TacticRepository repository, MasterDataImportService importService) {
        this.repository = repository;
        this.importService = importService;
    }

    @GetMapping
    public List<TacticDto> list(@RequestParam(required = false) TacticCategory category) {
        List<Tactic> tactics = category == null
                ? repository.findAllByOrderByNameAsc()
                : repository.findAllByCategoryOrderByNameAsc(category);
        return tactics.stream().map(TacticDto::from).toList();
    }

    /** 데이터 입력 진행률. 전법 상세가 얼마나 채워졌는지 확인용. */
    @GetMapping("/completeness")
    public Map<String, Object> completeness() {
        long total = repository.count();
        long missing = repository.countByCategoryIsNull();
        double percent = total == 0 ? 0 : (total - missing) * 100.0 / total;
        return Map.of(
                "total", total,
                "filled", total - missing,
                "missing", missing,
                "percent", Math.round(percent * 10) / 10.0);
    }

    @GetMapping("/{id}")
    public TacticDto get(@PathVariable UUID id) {
        return TacticDto.from(find(id));
    }

    @PatchMapping("/{id}")
    @Transactional
    public TacticDto patch(@PathVariable UUID id, @RequestBody TacticPatch patch) {
        Tactic tactic = find(id);
        if (patch.category() != null) {
            tactic.setCategory(patch.category());
        }
        if (patch.abilityType() != null) {
            tactic.setAbilityType(patch.abilityType());
        }
        if (patch.quality() != null) {
            tactic.setQuality(patch.quality());
        }
        if (patch.triggerRate() != null) {
            tactic.setTriggerRate(patch.triggerRate());
        }
        if (patch.targetCount() != null) {
            tactic.setTargetCount(patch.targetCount());
        }
        if (patch.effectText() != null) {
            tactic.setEffectText(patch.effectText());
        }
        if (patch.roleTags() != null) {
            tactic.setRoleTags(patch.roleTags().toArray(new String[0]));
        }
        if (patch.source() != null) {
            tactic.setSource(patch.source());
        }
        return TacticDto.from(repository.save(tactic));
    }

    /**
     * CSV 일괄 입력.
     * 헤더: name,category,abilityType,quality,triggerRate,targetCount,source,roleTags,effectText
     */
    @PostMapping(value = "/import", consumes = {MediaType.TEXT_PLAIN_VALUE, "text/csv"})
    public ImportReport importCsv(@RequestBody String csv) {
        return importService.importTactics(csv);
    }

    private Tactic find(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("전법을 찾을 수 없습니다: " + id));
    }
}
