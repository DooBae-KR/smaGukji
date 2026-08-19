package com.smagukji.backend.web;

import com.smagukji.backend.domain.AgentStaff;
import com.smagukji.backend.domain.AgentTeam;
import com.smagukji.backend.domain.AgentThought;
import com.smagukji.backend.repository.AgentTeamRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 오피스 팀 조회.
 *
 * <p>이 에이전트는 LLM 을 호출하지 않는다. 팀·직원·대사는 전부 DB 에 있고, 실제 계산은
 * 각 팀이 가리키는 화면(route)이 수행한다.
 */
@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private final AgentTeamRepository teamRepository;

    public AgentController(AgentTeamRepository teamRepository) {
        this.teamRepository = teamRepository;
    }

    public record TeamDto(UUID id, String code, String name, String icon, String shortName,
            String task, String report, String route, int position, List<StaffDto> staff) {
    }

    public record StaffDto(UUID id, String name, String role, String rank, boolean lead,
            String hairColor, String shirtColor, String accentColor, List<String> thoughts) {
    }

    @GetMapping("/teams")
    @Transactional(readOnly = true)
    public List<TeamDto> teams() {
        return teamRepository.findAllByOrderByPositionAsc().stream()
                .map(AgentController::toDto)
                .toList();
    }

    private static TeamDto toDto(AgentTeam team) {
        List<StaffDto> staff = team.getStaff().stream()
                .map(AgentController::toStaff)
                .toList();
        return new TeamDto(team.getId(), team.getCode(), team.getName(), team.getIcon(),
                team.getShortName(), team.getTask(), team.getReport(), team.getRoute(),
                team.getPosition(), staff);
    }

    private static StaffDto toStaff(AgentStaff s) {
        return new StaffDto(s.getId(), s.getName(), s.getRole(), s.getRank(), s.isLead(),
                s.getHairColor(), s.getShirtColor(), s.getAccentColor(),
                s.getThoughts().stream().map(AgentThought::getText).toList());
    }
}
