package com.smagukji.backend.web;

import com.smagukji.backend.domain.Faction;
import com.smagukji.backend.domain.General;
import com.smagukji.backend.repository.GeneralRepository;
import com.smagukji.backend.repository.TacticRepository;
import com.smagukji.backend.service.MasterDataImportService;
import com.smagukji.backend.service.MasterDataImportService.ImportReport;
import com.smagukji.backend.web.dto.GeneralDto;
import com.smagukji.backend.web.dto.GeneralPatch;
import java.util.List;
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

    public GeneralController(GeneralRepository repository, TacticRepository tacticRepository,
            MasterDataImportService importService) {
        this.repository = repository;
        this.tacticRepository = tacticRepository;
        this.importService = importService;
    }

    @GetMapping
    public List<GeneralDto> list(@RequestParam(required = false) Faction faction) {
        List<General> generals = faction == null
                ? repository.findAllByOrderByNameAsc()
                : repository.findAllByFactionOrderByNameAsc(faction);
        return generals.stream().map(GeneralDto::from).toList();
    }

    @GetMapping("/{id}")
    public GeneralDto get(@PathVariable UUID id) {
        return GeneralDto.from(find(id));
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
        if (patch.attack() != null) {
            general.setAttack(patch.attack());
        }
        if (patch.defense() != null) {
            general.setDefense(patch.defense());
        }
        if (patch.intelligence() != null) {
            general.setIntelligence(patch.intelligence());
        }
        if (patch.command() != null) {
            general.setCommand(patch.command());
        }
        if (patch.speed() != null) {
            general.setSpeed(patch.speed());
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
     * 헤더: name,unitType,attack,defense,intelligence,command,speed,signatureTacticName,note
     */
    @PostMapping(value = "/import", consumes = {MediaType.TEXT_PLAIN_VALUE, "text/csv"})
    public ImportReport importCsv(@RequestBody String csv) {
        return importService.importGenerals(csv);
    }

    private General find(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("장수를 찾을 수 없습니다: " + id));
    }
}
