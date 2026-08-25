package com.smagukji.backend.web.integration;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 외부 시뮬레이션 프로젝트용 열쇠 검사.
 *
 * <p>이 서버의 다른 API 는 브라우저에 앉은 «사람» 을 전제로 Supabase 토큰을 검증한다.
 * 그런데 시뮬레이션 프로젝트는 사람 없이 도는 서버라 로그인 화면을 거칠 수 없다.
 * 그래서 {@code /api/integration/**} 만 미리 나눠 가진 열쇠 한 개로 연다.
 *
 * <p>열쇠는 {@code X-API-Key} 헤더로만 받는다. {@code Authorization: Bearer} 로도 받으면
 * 앞단의 JWT 필터가 먼저 집어 «토큰이 깨졌다» 며 401 을 내므로 쓸 수 없다.
 *
 * <p>비교는 SHA-256 해시끼리 한다. 문자열을 앞에서부터 맞춰보면 걸리는 시간이 달라져
 * 열쇠를 한 글자씩 알아낼 수 있기 때문이다.
 *
 * <p>열쇠를 넣지 않고 띄우면 이 구간은 통째로 닫힌다({@link #enabled()} 가 false).
 * 설정을 빠뜨린 채 데이터가 열려 있는 것보다 낫다.
 */
public class IntegrationApiKeyFilter extends OncePerRequestFilter {

    /** 이 필터가 지키는 경로. */
    public static final String PATH = "/api/integration/**";

    /** 열쇠가 맞을 때 주는 권한. 사람 역할(ADMIN/OFFICER/MEMBER)과 섞이지 않는다. */
    public static final String ROLE = "INTEGRATION";

    public static final String HEADER = "X-API-Key";

    private static final String PREFIX = "/api/integration/";

    /** 열쇠가 짧으면 있으나 마나다. 눌러 찍어보는 공격을 막을 만큼은 되어야 한다. */
    public static final int MIN_KEY_LENGTH = 24;

    private final byte[] expectedHash;

    public IntegrationApiKeyFilter(String apiKey) {
        String key = apiKey == null ? "" : apiKey.trim();
        this.expectedHash = key.isEmpty() ? null : sha256(key);
    }

    /** 열쇠가 설정돼 있는지. false 면 SecurityConfig 가 이 구간을 막는다. */
    public boolean enabled() {
        return expectedHash != null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 예비 요청(OPTIONS)에는 헤더를 붙일 수 없다. CORS 쪽에서 먼저 끝난다.
        return CorsUtils.isPreFlightRequest(request) || !path(request).startsWith(PREFIX);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        if (!enabled()) {
            // 열쇠가 없으면 인증을 붙이지 않는다. 인가 규칙이 403 으로 끊는다.
            chain.doFilter(request, response);
            return;
        }

        String presented = request.getHeader(HEADER);
        if (presented == null || presented.isBlank()) {
            deny(response, "X-API-Key 헤더가 없습니다.");
            return;
        }
        if (!MessageDigest.isEqual(expectedHash, sha256(presented.trim()))) {
            deny(response, "열쇠가 올바르지 않습니다.");
            return;
        }

        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                "integration", null, List.of(new SimpleGrantedAuthority("ROLE_" + ROLE)));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    /**
     * 401 을 JSON 으로 내려준다.
     *
     * <p>여기서 직접 쓰는 이유는, 인가 필터까지 흘려보내면 브라우저가 아닌 호출자에게
     * 사유 없는 403 만 돌아가 «열쇠가 틀렸는지 경로가 틀렸는지» 를 구분할 수 없기 때문이다.
     */
    private static void deny(HttpServletResponse response, String detail) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("""
                {"type":"about:blank","title":"인증 실패","status":401,"detail":"%s"}"""
                .formatted(detail.replace("\"", "'")));
    }

    private static String path(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        return context != null && !context.isEmpty() && uri.startsWith(context)
                ? uri.substring(context.length())
                : uri;
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 은 모든 JVM 이 갖추도록 규격에 못 박혀 있다.
            throw new IllegalStateException("SHA-256 을 쓸 수 없습니다", e);
        }
    }
}
