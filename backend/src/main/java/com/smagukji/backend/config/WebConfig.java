package com.smagukji.backend.config;

import java.io.IOException;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** SPA 폴백에서 제외할 접두사. 없는 API 는 200 이 아니라 404 여야 한다. */
    private static final List<String> NEVER_FORWARD = List.of("api/", "actuator/", "error");

    // CORS 는 SecurityConfig 가 맡는다.
    //
    // Spring Security 를 붙이면 그쪽 필터가 MVC 보다 먼저 돌기 때문에, 여기서
    // addCorsMappings 로 걸어두면 예비 요청(OPTIONS)이 인증에 막혀 통째로 실패한다.
    // 설정이 두 군데 흩어지는 것도 좋지 않아 SecurityConfig 의 CorsConfigurationSource 로 모았다.

    /**
     * SPA 폴백.
     *
     * <p>프론트엔드를 JAR 의 {@code static/} 에 담아 한 서비스로 배포하면, 주소창에 직접
     * {@code /hr} 를 치거나 새로고침할 때 그런 정적 파일이 없어 404 가 난다. 실제 파일이 없는
     * 경로는 index.html 로 넘겨 React 라우터가 처리하게 한다.
     *
     * <p>단, {@code /api/**} 와 {@code /actuator/**} 는 절대 넘기지 않는다. 없는 API 가
     * HTML 200 으로 돌아오면 클라이언트는 JSON 파싱에서 엉뚱하게 실패하고, 노출하지 않은
     * 액추에이터가 열려 있는 것처럼 보인다. 확장자가 있는 요청도 파일 요청이므로 404 를 낸다.
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location)
                            throws IOException {
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        for (String prefix : NEVER_FORWARD) {
                            if (resourcePath.startsWith(prefix)) {
                                return null;
                            }
                        }
                        // 파일 확장자가 붙어 있으면 없는 파일을 부른 것이다.
                        if (resourcePath.contains(".")) {
                            return null;
                        }
                        Resource index = location.createRelative("index.html");
                        return index.exists() ? index : null;
                    }
                });
    }
}
