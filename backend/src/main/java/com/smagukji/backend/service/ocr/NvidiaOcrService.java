package com.smagukji.backend.service.ocr;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 전보 스크린샷을 NVIDIA 의 비전 모델(chat/completions, OpenAI 호환)로 읽어 텍스트를 뽑는다.
 *
 * <p>«턴별로 어떤 전법이 발동했는가» 를 사람이 옮겨 적지 않고 스크린샷에서 바로 얻기 위한
 * 창구다. 여기서 만드는 것은 순수 텍스트이고, 그 텍스트를 턴·전법으로 나누는 일은
 * {@code frontend/src/ocr/parse.ts} 가 한다 — 규칙(턴 표기, 발동 낱말)이 시트만큼이나
 * 자주 손볼 대상이라 서버를 다시 배포하지 않아도 되는 프론트에 둔다.
 *
 * <p>열쇠는 반드시 서버에만 있어야 한다. 브라우저 코드에 넣으면 페이지 소스만 봐도
 * 새어나가고, NVIDIA 사용량이 전부 그 열쇠로 청구된다. 그래서 화면은 이미지만 이 서버로
 * 올리고, 이 서버가 NVIDIA 를 대신 불러 결과만 돌려준다.
 */
@Service
public class NvidiaOcrService {

    private static final Logger log = LoggerFactory.getLogger(NvidiaOcrService.class);

    /**
     * 모델에 시키는 일. «전법 발동을 세는 화면이 읽을 것이다» 라고 알려서, 표 형태로
     * 정리하거나 요약하지 않고 화면에 보이는 줄을 그대로 옮기게 한다.
     */
    private static final String PROMPT = """
            이것은 모바일 전략 게임 '천하결전'의 전투 결과(전보) 스크린샷이다.
            화면에 보이는 텍스트를 위에서 아래 순서 그대로, 줄바꿈을 살려서 옮겨 적어라.
            - 번역하거나 요약하지 말고, 보이는 글자를 그대로 옮겨라.
            - 표나 목록으로 재구성하지 말고, 화면의 줄 구분을 그대로 유지하라.
            - 글자가 흐릿해서 확신이 없으면 가장 비슷해 보이는 글자를 적어라. 빈 줄로 건너뛰지 마라.
            - 설명이나 요약을 앞뒤에 덧붙이지 말고, 옮겨 적은 텍스트만 출력하라.
            """;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private final ObjectMapper mapper;
    private final String apiKey;
    private final String baseUrl;
    private final String model;
    private final int maxTokens;
    private final Duration requestTimeout;

    public NvidiaOcrService(
            ObjectMapper mapper,
            @Value("${app.ocr.nvidia.api-key:}") String apiKey,
            @Value("${app.ocr.nvidia.base-url:https://integrate.api.nvidia.com/v1/chat/completions}") String baseUrl,
            // 기본값은 NVIDIA 카탈로그에 실제로 있는 비전 모델이다. 다른 모델을 확인했으면
            // 환경변수로 바꿔 쓰면 된다 — 이름이 자주 바뀌는 값을 코드에 박아두지 않기 위해서다.
            @Value("${app.ocr.nvidia.model:meta/llama-3.2-90b-vision-instruct}") String model,
            @Value("${app.ocr.nvidia.max-tokens:2048}") int maxTokens,
            @Value("${app.ocr.nvidia.timeout-seconds:60}") long timeoutSeconds) {
        this.mapper = mapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.baseUrl = baseUrl;
        this.model = model;
        this.maxTokens = maxTokens;
        this.requestTimeout = Duration.ofSeconds(timeoutSeconds);
    }

    public boolean configured() {
        return !apiKey.isEmpty();
    }

    /** 이미지에서 읽어낸 원문. 모델이 뭐라도 뱉었지만 비어 있으면 빈 문자열을 돌려준다. */
    public String extractText(MultipartFile image) throws IOException, InterruptedException {
        if (!configured()) {
            throw new IllegalStateException(
                    "NVIDIA_API_KEY 가 설정되지 않아 전보 인식을 쓸 수 없습니다.");
        }

        String dataUrl = toDataUrl(image);
        String body = buildRequestBody(dataUrl);

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl))
                .timeout(requestTimeout)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            // 응답 본문에 계정·과금 정보가 섞여 나올 수 있어 그대로 노출하지 않는다.
            log.warn("NVIDIA OCR 호출 실패: HTTP {} (모델 {})", response.statusCode(), model);
            throw new IllegalStateException(
                    "전보 인식 서비스 호출에 실패했습니다 (HTTP %d).".formatted(response.statusCode()));
        }

        return readContent(response.body());
    }

    private String toDataUrl(MultipartFile image) throws IOException {
        String contentType = image.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("이미지 파일만 올릴 수 있습니다.");
        }
        String base64 = Base64.getEncoder().encodeToString(image.getBytes());
        return "data:" + contentType + ";base64," + base64;
    }

    /** OpenAI 호환 chat/completions 요청 본문. 이미지 하나 + 지시문 텍스트 하나. */
    private String buildRequestBody(String dataUrl) {
        ObjectNode root = mapper.createObjectNode();
        root.put("model", model);
        root.put("max_tokens", maxTokens);
        root.put("temperature", 0.0); // 옮겨 적기라 창의성이 필요 없다. 매번 같은 결과가 낫다.
        root.put("stream", false);

        ArrayNode content = mapper.createArrayNode();
        ObjectNode textPart = content.addObject();
        textPart.put("type", "text");
        textPart.put("text", PROMPT);

        ObjectNode imagePart = content.addObject();
        imagePart.put("type", "image_url");
        imagePart.putObject("image_url").put("url", dataUrl);

        ObjectNode userMessage = mapper.createObjectNode();
        userMessage.put("role", "user");
        userMessage.set("content", content);

        ArrayNode messages = mapper.createArrayNode();
        messages.add(userMessage);
        root.set("messages", messages);

        return root.toString();
    }

    private String readContent(String responseBody) throws IOException {
        JsonNode root = mapper.readTree(responseBody);
        JsonNode message = root.path("choices").path(0).path("message").path("content");
        if (message.isMissingNode() || message.isNull()) {
            throw new IllegalStateException("전보 인식 결과를 읽을 수 없습니다.");
        }
        return message.isString() ? message.asString() : "";
    }
}
