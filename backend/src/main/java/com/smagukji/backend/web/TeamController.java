package com.smagukji.backend.web;

import com.smagukji.backend.service.TeamService;
import com.smagukji.backend.service.analysis.TeamAnalysis;
import com.smagukji.backend.service.analysis.TeamAnalysisService;
import com.smagukji.backend.web.dto.TeamDto;
import com.smagukji.backend.web.dto.TeamRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/teams")
public class TeamController {

    /** 시뮬레이션 반복 상한. 이보다 크면 응답이 느려지기만 하고 정밀도 이득이 없다. */
    private static final int MAX_ITERATIONS = 200_000;
    private static final int DEFAULT_ITERATIONS = 20_000;

    private final TeamService teamService;

    public TeamController(TeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping
    public List<TeamDto> list() {
        return teamService.findAllDto();
    }

    @GetMapping("/{id}")
    public TeamDto get(@PathVariable UUID id) {
        return teamService.findDto(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TeamDto create(@Valid @RequestBody TeamRequest request) {
        return teamService.create(request);
    }

    @PutMapping("/{id}")
    public TeamDto update(@PathVariable UUID id, @Valid @RequestBody TeamRequest request) {
        return teamService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        teamService.delete(id);
    }

    /** 저장된 부대를 분석한다. */
    @GetMapping("/{id}/analysis")
    public TeamAnalysis analyze(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "" + TeamAnalysisService.DEFAULT_TURNS) int turns,
            @RequestParam(defaultValue = "" + DEFAULT_ITERATIONS) int iterations,
            @RequestParam(defaultValue = "42") long seed) {
        return teamService.analyze(id, turns, capIterations(iterations), seed);
    }

    /** 저장하지 않고 편성안을 바로 분석한다. 편성 UI 의 실시간 미리보기용. */
    @PostMapping("/analyze")
    public TeamAnalysis analyzeDraft(
            @Valid @RequestBody TeamRequest request,
            @RequestParam(defaultValue = "" + TeamAnalysisService.DEFAULT_TURNS) int turns,
            @RequestParam(defaultValue = "" + DEFAULT_ITERATIONS) int iterations,
            @RequestParam(defaultValue = "42") long seed) {
        return teamService.analyzeDraft(request, turns, capIterations(iterations), seed);
    }

    private static int capIterations(int requested) {
        if (requested > MAX_ITERATIONS) {
            throw new IllegalArgumentException(
                    "반복 횟수는 최대 %d 입니다.".formatted(MAX_ITERATIONS));
        }
        return requested;
    }
}
