package com.smagukji.backend.web;

import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "리소스 없음", e.getMessage());
    }

    /**
     * 인증 실패는 401 로 통일한다. 메시지에 ID 존재 여부 같은 힌트를 담지 않는다.
     * 실패 사유를 자세히 알려주면 계정 존재 여부를 캐낼 수 있기 때문이다.
     */
    @ExceptionHandler(com.smagukji.backend.service.hr.AuthService.AuthFailedException.class)
    public ProblemDetail handleAuthFailed(
            com.smagukji.backend.service.hr.AuthService.AuthFailedException e) {
        log.info("인증 실패: {}", e.getMessage());
        return problem(HttpStatus.UNAUTHORIZED, "인증 실패", e.getMessage());
    }

    /** 업로드 용량 초과. */
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ProblemDetail handleUploadTooLarge(
            org.springframework.web.multipart.MaxUploadSizeExceededException e) {
        return problem(HttpStatus.CONTENT_TOO_LARGE, "파일이 너무 큽니다",
                "업로드 가능한 최대 크기를 넘었습니다.");
    }

    /**
     * 본문 파싱 실패.
     *
     * <p>Jackson 의 원본 메시지에는 문제가 된 요청 본문 조각이 섞여 나올 수 있다.
     * 로그인 요청이 깨졌을 때 그 조각에 <b>비밀번호가 들어갈 수 있으므로</b> 절대 그대로
     * 응답에 싣지 않는다.
     */
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableBody(
            org.springframework.http.converter.HttpMessageNotReadableException e) {
        log.info("요청 본문 파싱 실패: {}", e.getClass().getSimpleName());
        return problem(HttpStatus.BAD_REQUEST, "요청 형식 오류",
                "요청 본문을 읽을 수 없습니다. JSON 형식을 확인하세요.");
    }

    /** 유니크 제약 위반 등. 원본 SQL 메시지에는 내부 스키마가 드러나므로 감춘다. */
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrity(
            org.springframework.dao.DataIntegrityViolationException e) {
        log.warn("데이터 제약 위반", e);
        return problem(HttpStatus.CONFLICT, "중복되거나 허용되지 않는 값",
                "이미 존재하거나 제약 조건에 맞지 않는 값입니다.");
    }

    /** 없는 정적 자원·경로. SPA 폴백에서 제외한 /api/**, /actuator/** 가 여기로 온다. */
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ProblemDetail handleNoResource(
            org.springframework.web.servlet.resource.NoResourceFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "리소스 없음", "요청한 경로를 찾을 수 없습니다.");
    }

    /**
     * 마지막 안전망. 처리되지 않은 예외의 원문이 그대로 나가지 않게 한다.
     *
     * <p>단, Spring 이 이미 상태코드를 정해 던진 예외({@link ErrorResponse})는 그 상태를
     * 존중한다. 전부 500 으로 뭉개면 404·405 같은 정상적인 응답까지 서버 오류로 바뀐다.
     */
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception e) {
        if (e instanceof ErrorResponse errorResponse) {
            HttpStatus status = HttpStatus.resolve(errorResponse.getStatusCode().value());
            if (status != null && !status.is5xxServerError()) {
                log.debug("클라이언트 오류 {}: {}", status, e.getClass().getSimpleName());
                return problem(status, status.getReasonPhrase(), "요청을 처리할 수 없습니다.");
            }
        }
        log.error("처리되지 않은 예외", e);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류",
                "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleBadRequest(IllegalArgumentException e) {
        return problem(HttpStatus.BAD_REQUEST, "잘못된 요청", e.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail handleConflict(IllegalStateException e) {
        log.warn("처리 불가 상태: {}", e.getMessage());
        return problem(HttpStatus.CONFLICT, "처리할 수 없는 상태", e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> "%s: %s".formatted(fe.getField(), fe.getDefaultMessage()))
                .reduce((a, b) -> a + ", " + b)
                .orElse("요청 값이 올바르지 않습니다");
        return problem(HttpStatus.BAD_REQUEST, "검증 실패", detail);
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setTitle(title);
        pd.setType(URI.create("urn:smagukji:error:" + status.value()));
        return pd;
    }
}
