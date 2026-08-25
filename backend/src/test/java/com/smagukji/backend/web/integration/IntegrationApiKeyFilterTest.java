package com.smagukji.backend.web.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.servlet.ServletException;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/** 연동 열쇠 검사 단위 테스트. */
class IntegrationApiKeyFilterTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef";

    private final IntegrationApiKeyFilter filter = new IntegrationApiKeyFilter(KEY);

    /** 필터를 한 번 태운 결과. 뒷단까지 갔는지와, 그때 붙어 있던 인증 정보. */
    private record Result(boolean reachedChain, Authentication authentication) {
    }

    private Result run(MockHttpServletRequest request, MockHttpServletResponse response,
            IntegrationApiKeyFilter target) throws ServletException, IOException {
        AtomicReference<Result> seen = new AtomicReference<>(new Result(false, null));
        target.doFilter(request, response, (req, res) ->
                seen.set(new Result(true, SecurityContextHolder.getContext().getAuthentication())));
        return seen.get();
    }

    private MockHttpServletRequest get(String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
        request.setRequestURI(uri);
        return request;
    }

    @Test
    @DisplayName("열쇠가 맞으면 ROLE_INTEGRATION 을 달고 통과한다")
    void validKeyPasses() throws Exception {
        MockHttpServletRequest request = get("/api/integration/v1/generals");
        request.addHeader(IntegrationApiKeyFilter.HEADER, KEY);
        MockHttpServletResponse response = new MockHttpServletResponse();

        Result result = run(request, response, filter);

        assertEquals(200, response.getStatus());
        assertTrue(result.reachedChain());
        assertTrue(result.authentication().isAuthenticated());
        assertTrue(result.authentication().getAuthorities()
                .contains(new SimpleGrantedAuthority("ROLE_INTEGRATION")));
        // 통과한 뒤에는 남기지 않는다. 같은 스레드를 재사용하는 서버에서 새어나가면 안 된다.
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    @DisplayName("열쇠가 틀리면 체인을 타지 않고 401 로 끊는다")
    void wrongKeyRejected() throws Exception {
        MockHttpServletRequest request = get("/api/integration/v1/generals");
        request.addHeader(IntegrationApiKeyFilter.HEADER, KEY + "x");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(run(request, response, filter).reachedChain());
        assertEquals(401, response.getStatus());
    }

    @Test
    @DisplayName("헤더가 없으면 401")
    void missingHeaderRejected() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(run(get("/api/integration/v1/snapshot"), response, filter).reachedChain());
        assertEquals(401, response.getStatus());
    }

    @Test
    @DisplayName("연동 경로가 아니면 손대지 않는다")
    void otherPathsUntouched() throws Exception {
        MockHttpServletRequest request = get("/api/generals");
        request.addHeader(IntegrationApiKeyFilter.HEADER, "아무 값");
        MockHttpServletResponse response = new MockHttpServletResponse();

        // 인증이 붙지 않은 채 그대로 흘러간다. 사람용 API 는 뒤의 JWT 필터가 판단한다.
        Result result = run(request, response, filter);
        assertTrue(result.reachedChain());
        assertNull(result.authentication());
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("열쇠를 설정하지 않으면 꺼진 상태로 뜬다 — 인증을 붙이지 않는다")
    void withoutKeyDisabled() throws Exception {
        IntegrationApiKeyFilter disabled = new IntegrationApiKeyFilter("  ");
        assertFalse(disabled.enabled());

        MockHttpServletRequest request = get("/api/integration/v1/generals");
        request.addHeader(IntegrationApiKeyFilter.HEADER, KEY);
        MockHttpServletResponse response = new MockHttpServletResponse();

        // 여기서 401 을 내지 않는 것은, 인가 규칙(SecurityConfig)이 거부를 맡기 때문이다.
        Result result = run(request, response, disabled);
        assertTrue(result.reachedChain());
        assertNull(result.authentication());
    }
}
