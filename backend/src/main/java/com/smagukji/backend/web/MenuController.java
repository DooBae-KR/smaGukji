package com.smagukji.backend.web;

import com.smagukji.backend.domain.AccountRole;
import com.smagukji.backend.domain.MenuItem;
import com.smagukji.backend.repository.MenuItemRepository;
import com.smagukji.backend.service.hr.AuthService;
import com.smagukji.backend.web.hr.HrAuthController;
import jakarta.validation.Valid;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 화면 메뉴 노출 제어.
 *
 * <p>메뉴는 로그인한 계정의 역할로 걸러진다. 비로그인 상태에서는 아무 메뉴도 내려가지 않는다
 * (로그인 화면이 먼저 뜬다). 어떤 역할에게 어떤 메뉴를 열지는 소스코드가 아니라
 * DB(`menu_item.allowed_roles`)에서 관리자가 정한다.
 */
@RestController
@RequestMapping("/api/menus")
public class MenuController {

    private final MenuItemRepository repository;
    private final AuthService authService;

    public MenuController(MenuItemRepository repository, AuthService authService) {
        this.repository = repository;
        this.authService = authService;
    }

    public record MenuDto(String code, String label, String route, String icon,
            List<String> allowedRoles, boolean visible, int position) {
    }

    /** 현재 세션 역할로 걸러진 메뉴. 비로그인이면 빈 목록. */
    @GetMapping
    @Transactional(readOnly = true)
    public List<MenuDto> menus(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token) {

        AccountRole role = roleOf(token);
        return repository.findAllByOrderByPositionAsc().stream()
                .filter(m -> m.isVisibleTo(role))
                .map(MenuController::toDto)
                .toList();
    }

    /** 관리자용 전체 목록. 꺼둔 메뉴까지 포함해서 관리 화면에 뿌린다. */
    @GetMapping("/all")
    @Transactional(readOnly = true)
    public List<MenuDto> allMenus(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token) {

        requireSystemAdmin(token);
        return repository.findAllByOrderByPositionAsc().stream()
                .map(MenuController::toDto)
                .toList();
    }

    /** 선택 가능한 역할 목록(코드 + 한글 라벨). 프론트에 하드코딩하지 않기 위해 내려준다. */
    @GetMapping("/roles")
    public List<RoleDto> roles() {
        return Arrays.stream(AccountRole.values())
                .map(r -> new RoleDto(r.name(), r.label()))
                .toList();
    }

    public record RoleDto(String code, String label) {
    }

    public record MenuPatch(Boolean visible, List<String> allowedRoles, String label) {
    }

    @PatchMapping("/{code}")
    @Transactional
    public MenuDto patch(
            @RequestHeader(value = HrAuthController.TOKEN_HEADER, required = false) String token,
            @PathVariable String code,
            @Valid @RequestBody MenuPatch patch) {

        requireSystemAdmin(token);
        MenuItem item = repository.findByCode(code)
                .orElseThrow(() -> new ResourceNotFoundException("메뉴를 찾을 수 없습니다: " + code));

        if (patch.visible() != null) {
            item.setVisible(patch.visible());
        }
        if (patch.allowedRoles() != null) {
            item.setAllowedRoles(normalizeRoles(patch.allowedRoles(), code));
        }
        if (patch.label() != null && !patch.label().isBlank()) {
            item.setLabel(patch.label().trim());
        }
        return toDto(repository.save(item));
    }

    // ---------------------------------------------------------------

    /**
     * 관리자를 목록에서 빼면 그 메뉴를 되살릴 방법이 사라진다. 항상 ADMIN 을 포함시킨다.
     */
    private static String[] normalizeRoles(List<String> raw, String code) {
        var roles = new java.util.LinkedHashSet<String>();
        roles.add(AccountRole.ADMIN.name());
        for (String r : raw) {
            if (r == null || r.isBlank()) {
                continue;
            }
            // 알 수 없는 값이면 여기서 IllegalArgumentException 이 나고 400 으로 나간다.
            roles.add(AccountRole.valueOf(r.trim().toUpperCase(Locale.ROOT)).name());
        }
        return roles.toArray(new String[0]);
    }

    /** 토큰이 없거나 잘못돼도 예외를 던지지 않는다. 메뉴 조회는 실패해도 화면이 떠야 한다. */
    private AccountRole roleOf(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            return authService.requireSession(token).role();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private void requireSystemAdmin(String token) {
        AccountRole role = roleOf(token);
        if (role == null || !role.canManageSystem()) {
            throw new AuthService.AuthFailedException("관리자만 수행할 수 있습니다.");
        }
    }

    private static MenuDto toDto(MenuItem m) {
        return new MenuDto(m.getCode(), m.getLabel(), m.getRoute(), m.getIcon(),
                List.of(m.getAllowedRoles()), m.isVisible(), m.getPosition());
    }
}
