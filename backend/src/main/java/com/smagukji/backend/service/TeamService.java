package com.smagukji.backend.service;

import com.smagukji.backend.domain.General;
import com.smagukji.backend.domain.Tactic;
import com.smagukji.backend.domain.Team;
import com.smagukji.backend.domain.TeamSlot;
import com.smagukji.backend.domain.TeamSlotTactic;
import com.smagukji.backend.repository.GeneralRepository;
import com.smagukji.backend.repository.TacticRepository;
import com.smagukji.backend.repository.TeamRepository;
import com.smagukji.backend.service.analysis.TeamAnalysis;
import com.smagukji.backend.service.analysis.TeamAnalysisService;
import com.smagukji.backend.web.ResourceNotFoundException;
import com.smagukji.backend.web.dto.TeamDto;
import com.smagukji.backend.web.dto.TeamRequest;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.random.RandomGenerator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TeamService {

    private final TeamRepository teamRepository;
    private final GeneralRepository generalRepository;
    private final TacticRepository tacticRepository;
    private final TeamAnalysisService analysisService;

    public TeamService(TeamRepository teamRepository, GeneralRepository generalRepository,
            TacticRepository tacticRepository, TeamAnalysisService analysisService) {
        this.teamRepository = teamRepository;
        this.generalRepository = generalRepository;
        this.tacticRepository = tacticRepository;
        this.analysisService = analysisService;
    }

    // DTO 변환은 반드시 트랜잭션 안에서 한다.
    // open-in-view=false 라서 컨트롤러에서 변환하면 지연 로딩이 LazyInitializationException 으로 터진다.

    @Transactional(readOnly = true)
    public List<TeamDto> findAllDto() {
        return teamRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(TeamDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public TeamDto findDto(UUID id) {
        return TeamDto.from(findById(id));
    }

    @Transactional(readOnly = true)
    public Team findById(UUID id) {
        return teamRepository.findByIdWithSlots(id)
                .orElseThrow(() -> new ResourceNotFoundException("부대를 찾을 수 없습니다: " + id));
    }

    @Transactional
    public TeamDto create(TeamRequest request) {
        Team team = new Team(request.name(), request.costLimit());
        team.setDescription(request.description());
        applySlots(team, request);
        return TeamDto.from(teamRepository.save(team));
    }

    @Transactional
    public TeamDto update(UUID id, TeamRequest request) {
        Team team = findById(id);
        team.setName(request.name());
        team.setDescription(request.description());
        if (request.costLimit() != null) {
            team.setCostLimit(request.costLimit());
        }
        team.clearSlots();
        applySlots(team, request);
        return TeamDto.from(teamRepository.save(team));
    }

    @Transactional
    public void delete(UUID id) {
        if (!teamRepository.existsById(id)) {
            throw new ResourceNotFoundException("부대를 찾을 수 없습니다: " + id);
        }
        teamRepository.deleteById(id);
    }

    @Transactional(readOnly = true)
    public TeamAnalysis analyze(UUID id, int turns, int iterations, long seed) {
        Team team = findById(id);
        return analysisService.analyze(team, turns, iterations, seededRandom(seed));
    }

    /** 같은 seed 면 항상 같은 결과가 나오도록 고정 시드 생성기를 쓴다. */
    private static RandomGenerator seededRandom(long seed) {
        return new Random(seed);
    }

    /** 요청의 슬롯 정보를 부대에 반영한다. 이름이 맞지 않으면 그 자리에서 실패시킨다. */
    private void applySlots(Team team, TeamRequest request) {
        List<TeamRequest.SlotRequest> slots = request.slots();
        if (slots == null || slots.isEmpty()) {
            return;
        }

        Set<Integer> usedPositions = new HashSet<>();
        Set<String> usedGenerals = new HashSet<>();

        for (TeamRequest.SlotRequest slotRequest : slots) {
            if (!usedPositions.add(slotRequest.position())) {
                throw new IllegalArgumentException(
                        "슬롯 위치가 중복됩니다: " + slotRequest.position());
            }
            if (!usedGenerals.add(slotRequest.generalName())) {
                throw new IllegalArgumentException(
                        "같은 장수를 두 번 넣을 수 없습니다: " + slotRequest.generalName());
            }

            General general = generalRepository.findByName(slotRequest.generalName())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "장수를 찾을 수 없습니다: " + slotRequest.generalName()));

            TeamSlot slot = new TeamSlot(slotRequest.position(), general);

            List<String> tacticNames = slotRequest.tacticNames();
            if (tacticNames != null) {
                Set<String> usedTactics = new HashSet<>();
                int position = 1;
                for (String tacticName : tacticNames) {
                    if (!usedTactics.add(tacticName)) {
                        throw new IllegalArgumentException(
                                "한 장수에게 같은 전법을 두 번 장착할 수 없습니다: " + tacticName);
                    }
                    Tactic tactic = tacticRepository.findByName(tacticName)
                            .orElseThrow(() -> new ResourceNotFoundException(
                                    "전법을 찾을 수 없습니다: " + tacticName));
                    slot.addTactic(new TeamSlotTactic(position++, tactic));
                }
            }

            team.addSlot(slot);
        }
    }

    /** 부대 없이 임시 편성을 즉석에서 분석한다. 저장하지 않는다. */
    @Transactional(readOnly = true)
    public TeamAnalysis analyzeDraft(TeamRequest request, int turns, int iterations, long seed) {
        Team team = new Team(request.name() == null ? "임시 편성" : request.name(),
                request.costLimit() == null ? new BigDecimal("15.0") : request.costLimit());
        applySlots(team, request);
        return analysisService.analyze(team, turns, iterations, seededRandom(seed));
    }
}
