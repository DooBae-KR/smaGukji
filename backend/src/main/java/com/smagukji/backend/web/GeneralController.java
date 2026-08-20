package com.smagukji.backend.web;

import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.General;
import com.smagukji.backend.repository.GeneralRepository;
import com.smagukji.backend.repository.TacticRepository;
import com.smagukji.backend.service.GeneralSheetSyncService;
import com.smagukji.backend.service.MasterDataImportService;
import com.smagukji.backend.service.MasterDataImportService.ImportReport;
import com.smagukji.backend.web.dto.GeneralDto;
import com.smagukji.backend.web.dto.GeneralPatch;
import java.io.IOException;
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
@RequestMapping("/api/generals")
public class GeneralController {

    private final GeneralRepository repository;
    private final TacticRepository tacticRepository;
    private final MasterDataImportService importService;
    private final GeneralSheetSyncService sheetSyncService;

    public GeneralController(GeneralRepository repository, TacticRepository tacticRepository,
            MasterDataImportService importService, GeneralSheetSyncService sheetSyncService) {
        this.repository = repository;
        this.tacticRepository = tacticRepository;
        this.importService = importService;
        this.sheetSyncService = sheetSyncService;
    }

    // DTO 변환은 트랜잭션 안에서 한다. signatureTactic 이 LAZY 라 밖에서 만지면
    // LazyInitializationException 이 난다. (open-in-view=false)
    @GetMapping
    @Transactional(readOnly = true)
    public List<GeneralDto> list(@RequestParam(required = false) Faction faction) {
        List<General> generals = faction == null
                ? repository.findAllWithTactic()
                : repository.findAllByFactionWithTactic(faction);
        return generals.stream().map(GeneralDto::from).toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public GeneralDto get(@PathVariable UUID id) {
        return GeneralDto.from(repository.findByIdWithTactic(id)
                .orElseThrow(() -> new ResourceNotFoundException("장수를 찾을 수 없습니다: " + id)));
    }

    @PatchMapping("/{id}")
    @Transactional
    public GeneralDto patch(@PathVariable UUID id, @RequestBody GeneralPatch patch) {
        General general = find(id);
        if (patch.faction() != null) {
            general.setFaction(patch.faction());
        }
        if (patch.cost() != null) {
            general.setCost(patch.cost());
        }
        if (patch.unitType() != null) {
            general.setUnitType(patch.unitType());
        }
        if (patch.camp() != null) {
            general.setCamp(patch.camp());
        }
        if (patch.dispositions() != null) {
            general.setDispositions(patch.dispositions().stream()
                    .map(Enum::name).toArray(String[]::new));
        }
        if (patch.might() != null) {
            general.setMight(patch.might());
        }
        if (patch.intellect() != null) {
            general.setIntellect(patch.intellect());
        }
        if (patch.leadership() != null) {
            general.setLeadership(patch.leadership());
        }
        if (patch.initiative() != null) {
            general.setInitiative(patch.initiative());
        }
        if (patch.statLevel() != null) {
            general.setStatLevel(patch.statLevel());
        }
        if (patch.note() != null) {
            general.setNote(patch.note());
        }
        if (patch.signatureTacticName() != null) {
            general.setSignatureTactic(tacticRepository.findByName(patch.signatureTacticName())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "전법을 찾을 수 없습니다: " + patch.signatureTacticName())));
        }
        return GeneralDto.from(repository.save(general));
    }

    /**
     * CSV 일괄 입력.
     * 헤더: name,unitType,camp,dispositions,might,intellect,leadership,initiative,
     *      statLevel,signatureTacticName,note
     */
    @PostMapping(value = "/import", consumes = {MediaType.TEXT_PLAIN_VALUE, "text/csv"})
    public ImportReport importCsv(@RequestBody String csv) {
        return importService.importGenerals(csv);
    }

    /**
     * 스프레드시트에서 장수 분류를 다시 읽어 반영한다.
     *
     * <p>시트가 계속 편집되므로 마이그레이션에 스냅샷을 굽지 않고 이 엔드포인트로 맞춘다.
     * 언제 눌러도 안전하며, 시트에만 있는 이름으로 장수를 만들지는 않는다.
     */
    @PostMapping("/sync-sheet")
    public GeneralSheetSyncService.SyncResult syncSheet() throws IOException, InterruptedException {
        return sheetSyncService.sync();
    }

    /** 시트에 쓸 수 있는 분류 값 목록. 새 값을 넣기 전에 확인용. */
    @GetMapping("/sheet-vocabulary")
    public Map<String, List<String>> sheetVocabulary() {
        return sheetSyncService.vocabulary();
    }

    private General find(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("장수를 찾을 수 없습니다: " + id));
    }
}
