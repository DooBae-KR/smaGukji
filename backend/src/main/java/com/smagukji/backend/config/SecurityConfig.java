package com.smagukji.backend.config;

import com.smagukji.backend.web.integration.IntegrationApiKeyFilter;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * 이 서버는 이제 «계산 전용»이다.
 *
 * <p>로그인과 인사 데이터는 항상 켜져 있는 Supabase 로 옮겼다. 여기 남은 것은
 * 덱 추천 시뮬레이션, 시트 파싱, 마스터 데이터 갱신처럼 서버가 있어야 하는 일뿐이다.
 * 무료 인스턴스가 잠들어 첫 요청이 느려도, 이것들은 버튼을 눌러서 하는 일이라 괜찮다.
 *
 * <p>인증은 Supabase 가 발급한 토큰을 검증하는 것으로 끝난다. 서명은 ES256 이고
 * 공개키는 JWKS 로 공개돼 있어, 이 서버가 들고 있어야 할 비밀값이 하나도 없다.
 *
 * <p>역할은 토큰에 없다. 토큰의 {@code sub} 로 {@code app_profile} 을 찾아 붙인다
 * ({@link SupabaseProfiles}). 그래서 «관리자 승격» 이 즉시 반영되고,
 * 계정을 중지하면 곧바로 막힌다.
 */
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    private final String supabaseUrl;
    private final String[] allowedOrigins;
    private final String[] integrationOrigins;
    private final String integrationApiKey;
    private final SupabaseProfiles profiles;

    public SecurityConfig(
            @Value("${app.security.supabase.url:}") String supabaseUrl,
            @Value("${app.cors.allowed-origins:}") String[] allowedOrigins,
            @Value("${app.integration.allowed-origins:}") String[] integrationOrigins,
            @Value("${app.integration.api-key:}") String integrationApiKey,
            SupabaseProfiles profiles) {
        this.supabaseUrl = supabaseUrl == null ? "" : supabaseUrl.trim().replaceAll("/+$", "");
        this.allowedOrigins = clean(allowedOrigins);
        this.integrationOrigins = clean(integrationOrigins);
        this.integrationApiKey = integrationApiKey == null ? "" : integrationApiKey.trim();
        this.profiles = profiles;
    }

    private static String[] clean(String[] values) {
        return Arrays.stream(values == null ? new String[0] : values)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
    }

    private boolean configured() {
        return !supabaseUrl.isEmpty();
    }

    /**
     * 토큰 검증기.
     *
     * <p>공개키는 Supabase 가 JWKS 로 내려주므로 키가 교체돼도 따라간다.
     * 발급자(iss)까지 확인해 다른 프로젝트에서 만든 토큰을 걸러낸다.
     */
    @Bean
    JwtDecoder jwtDecoder() {
        if (!configured()) {
            // 없는 채로 두면 컨텍스트가 뜨지 않으므로 «항상 거부하는» 검증기를 준다.
            // 아래 필터 체인이 /api 를 통째로 막으므로 실제로 불릴 일은 없다.
            return token -> {
                throw new org.springframework.security.oauth2.jwt.JwtException(
                        "SUPABASE_URL 이 설정되지 않아 토큰을 검증할 수 없습니다.");
            };
        }
        String jwks = supabaseUrl + "/auth/v1/.well-known/jwks.json";
        String issuer = supabaseUrl + "/auth/v1";
        log.info("Supabase 토큰 검증: {}", jwks);

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwks).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
        return decoder;
    }

    /**
     * 토큰 → 권한.
     *
     * <p>Supabase 가 넣어주는 {@code role} 클레임은 언제나 {@code authenticated} 라
     * 우리에게 쓸모가 없다. 대신 프로필을 찾아 ROLE_ADMIN / ROLE_OFFICER / ROLE_MEMBER 를 붙인다.
     * 프로필이 없거나 중지된 계정이면 아무 권한도 주지 않으므로, 토큰이 유효해도 통과하지 못한다.
     */
    private AbstractAuthenticationToken toAuthentication(Jwt jwt) {
        var authorities = profiles.find(jwt)
                .map(a -> List.of(new SimpleGrantedAuthority("ROLE_" + a.role().name())))
                .orElseGet(List::of);
        return new JwtAuthenticationToken(jwt, authorities);
    }

    /**
     * 연동 열쇠 검사기.
     *
     * <p>일부러 {@code @Bean} 으로 두지 않는다. 서블릿 필터를 빈으로 등록하면 Boot 가
     * 전체 요청 경로에도 자동으로 끼워 넣어 같은 검사가 두 번 돈다.
     */
    private IntegrationApiKeyFilter integrationFilter() {
        IntegrationApiKeyFilter filter = new IntegrationApiKeyFilter(integrationApiKey);
        if (!filter.enabled()) {
            log.warn("INTEGRATION_API_KEY 가 없습니다. 시뮬레이션 연동 API({})를 막습니다.",
                    IntegrationApiKeyFilter.PATH);
        } else if (integrationApiKey.length() < IntegrationApiKeyFilter.MIN_KEY_LENGTH) {
            log.warn("INTEGRATION_API_KEY 가 {}자 미만입니다. 무작위로 {}자 이상을 쓰세요.",
                    IntegrationApiKeyFilter.MIN_KEY_LENGTH, IntegrationApiKeyFilter.MIN_KEY_LENGTH);
        } else {
            log.info("시뮬레이션 연동 API 를 엽니다: {} (X-API-Key)", IntegrationApiKeyFilter.PATH);
        }
        return filter;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        IntegrationApiKeyFilter integration = integrationFilter();

        http
                // 토큰을 Authorization 헤더로 받는다. 쿠키를 쓰지 않으므로 CSRF 의 대상이 아니다.
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // 브라우저 기본 인증 팝업이 뜨지 않게 한다. API 는 401 JSON 이면 충분하다.
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                // 열쇠 검사는 인가 판정보다 먼저 돌아야 권한이 붙는다.
                .addFilterBefore(integration, AuthorizationFilter.class);

        if (!configured()) {
            // 사람이 쓰는 API 는 토큰을 검증할 수 없어 전부 막는다. 다만 연동 창구는 자기
            // 열쇠로 스스로를 지키므로, 열쇠가 있으면 Supabase 설정과 무관하게 열어 둔다.
            log.error("SUPABASE_URL 이 없습니다. 인증을 검증할 수 없어 /api 를 전부 막습니다.");
            return http.authorizeHttpRequests(a -> {
                if (integration.enabled()) {
                    a.requestMatchers(IntegrationApiKeyFilter.PATH)
                            .hasRole(IntegrationApiKeyFilter.ROLE);
                }
                a.requestMatchers("/api/**").denyAll()
                        .anyRequest().permitAll();
            }).build();
        }

        http.oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(this::toAuthentication)));

        http.authorizeHttpRequests(a -> {
            // 외부 시뮬레이션 프로젝트가 읽어가는 구간. 사람의 토큰이 아니라 열쇠로 연다.
            // 열쇠가 없으면 규칙을 아예 걸지 않아, 아래 «/api/** 는 인증» 에 걸려 닫힌다.
            if (integration.enabled()) {
                a.requestMatchers(IntegrationApiKeyFilter.PATH).hasRole(IntegrationApiKeyFilter.ROLE);
            }

            a
                // 헬스체크는 Render 가 부른다. 토큰이 있을 수 없다.
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()

                // 마스터 데이터 갱신은 관리자만. 시트를 다시 읽어 전체를 덮어쓰는 동작이다.
                .requestMatchers("/api/sheets/**").hasRole("ADMIN")
                .requestMatchers("/api/assets/import").hasRole("ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/generals/**", "/api/tactics/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/generals/import", "/api/tactics/import").hasRole("ADMIN")

                // 인사 탭. 동맹 단위 검사는 컨트롤러가 한 번 더 한다.
                .requestMatchers("/api/hr/**").hasAnyRole("ADMIN", "OFFICER")

                // 나머지 API(덱 편성·시뮬레이션·조회)는 로그인만 되어 있으면 된다.
                .requestMatchers("/api/**").authenticated()

                // 프론트는 Netlify 가 서빙하지만, 이 서버에도 남겨두어 대체 경로로 쓴다.
                .anyRequest().permitAll();
        });

        return http.build();
    }

    /**
     * CORS.
     *
     * <p>프론트가 Netlify 로 떨어져 나가면서 «다른 오리진» 이 됐다. 허용 목록을 명시하지 않으면
     * 브라우저가 모든 요청을 막는다. 반대로 아무나 허용하면 남의 사이트가 사용자의 토큰으로
     * 이 API 를 부를 수 있으므로, 와일드카드는 쓰지 않는다.
     *
     * <p>연동 구간은 규칙이 다르다. 서버끼리 부르는 것이 기본이라 브라우저가 없고, 그때는
     * CORS 자체가 필요 없다. 시뮬레이션 쪽 «화면» 이 직접 부를 때만
     * {@code INTEGRATION_ALLOWED_ORIGINS} 에 그 주소를 넣는다. 이 경우 열쇠가 브라우저에
     * 노출된다는 점을 알고 써야 한다.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        if (allowedOrigins.length == 0) {
            log.warn("CORS 허용 오리진이 비어 있습니다. Netlify 주소를 CORS_ALLOWED_ORIGINS 에 넣어주세요.");
        } else {
            log.info("CORS 허용 오리진: {}", String.join(", ", allowedOrigins));
        }
        config.setAllowedOrigins(List.of(allowedOrigins));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // 먼저 등록한 규칙이 이긴다. 연동 구간을 뒤에 두면 위의 /api/** 에 먼저 걸린다.
        if (integrationOrigins.length > 0) {
            log.info("연동 CORS 허용 오리진: {}", String.join(", ", integrationOrigins));
            CorsConfiguration integration = new CorsConfiguration();
            integration.setAllowedOrigins(List.of(integrationOrigins));
            // 읽기 전용 창구다. 다른 메서드를 열어줄 이유가 없다.
            integration.setAllowedMethods(List.of("GET", "OPTIONS"));
            integration.setAllowedHeaders(List.of(IntegrationApiKeyFilter.HEADER, "Accept"));
            integration.setMaxAge(3600L);
            source.registerCorsConfiguration("/api/integration/**", integration);
        }
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
