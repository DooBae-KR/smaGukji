# 두 가지로 빌드할 수 있다.
#
#   docker build -t smagukji .                    ← 기본. 프론트를 JAR 안에 넣은 한 덩어리
#   docker build --target api -t smagukji-api .   ← 백엔드만. 프론트는 nginx 가 따로 서빙
#
# 왜 둘인가
#   Render·Northflank 처럼 «컨테이너 하나» 만 받는 곳에서는 프론트를 JAR 안에 넣어야
#   같은 오리진이 되어 CORS 를 안 탄다. 반면 Oracle 처럼 nginx 를 앞에 두는 구성에서는
#   정적 파일을 nginx 가 직접 주는 편이 낫다 — 자바가 카드 이미지 160장과 판독기 부품
#   14MB 를 흘려보낼 이유가 없고, 백엔드를 재시작해도 화면은 살아 있다.
#
#   --target api 로 빌드하면 BuildKit 이 프론트 빌드 단계를 아예 건너뛴다. 그래서
#   백엔드만 고칠 때는 npm 빌드를 기다리지 않아도 된다.

# ---------------------------------------------------------------
# 1) 프론트엔드 빌드
# ---------------------------------------------------------------
# alpine(musl) 대신 slim(glibc) 을 쓴다. Vite 8 의 rolldown 은 플랫폼별 네이티브
# 바이너리를 쓰는데, Windows 에서 만든 package-lock.json 에 musl 바이너리가 없으면
# alpine 에서 npm ci 가 깨진다.
FROM node:24-slim AS frontend
WORKDIR /app

# 의존성 레이어를 먼저 굳혀서 소스만 바뀌면 npm ci 를 건너뛴다.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./

# Vite 는 VITE_* 값을 «빌드 시점에» 번들에 새겨 넣는다. 런타임 환경변수로는 바뀌지 않는다.
# 그래서 여기서 build-arg 로 받아야 한다. 비어 있으면 화면이 «설정이 없습니다» 로 뜬다.
#
# anon 키는 브라우저에 나가는 값이라 번들에 들어가는 것이 정상이다.
# 실제 차단은 DB 의 RLS 정책이 한다(V18/V21). service_role 키는 여기 넣으면 안 된다.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_API_BASE_URL=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---------------------------------------------------------------
# 2) 백엔드 빌드 준비 — 소스와 Gradle 캐시까지만
# ---------------------------------------------------------------
FROM eclipse-temurin:17-jdk AS backend-base
WORKDIR /app

# Gradle 래퍼와 빌드 스크립트만 먼저 복사해 의존성 캐시를 만든다.
COPY backend/gradlew backend/gradlew.bat ./
COPY backend/gradle ./gradle
COPY backend/build.gradle.kts backend/settings.gradle.kts ./
# Windows 에서 커밋되면 CRLF 와 실행권한 문제가 생기므로 여기서 정리한다.
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew \
    && ./gradlew --version --no-daemon

COPY backend/src ./src

# ---------------------------------------------------------------
# 3-a) 백엔드만 빌드 (프론트는 nginx 가 따로 준다)
# ---------------------------------------------------------------
FROM backend-base AS backend-api
# 한 줄로 묶으면 실패했을 때 어느 단계인지 알 수 없다.
RUN ./gradlew compileJava --no-daemon --stacktrace
RUN ./gradlew processResources --no-daemon --stacktrace
RUN ./gradlew bootJar --no-daemon -x test --stacktrace

# ---------------------------------------------------------------
# 3-b) 프론트를 JAR 안에 넣어 빌드 (한 덩어리로 배포할 때)
# ---------------------------------------------------------------
FROM backend-base AS backend-full
COPY --from=frontend /app/dist ./src/main/resources/static
RUN ./gradlew compileJava --no-daemon --stacktrace
RUN ./gradlew processResources --no-daemon --stacktrace
RUN ./gradlew bootJar --no-daemon -x test --stacktrace

# ---------------------------------------------------------------
# 4) 런타임 — 두 갈래가 같은 바탕을 쓴다
# ---------------------------------------------------------------
FROM eclipse-temurin:17-jre-alpine AS runtime-base
WORKDIR /app

# root 로 돌리지 않는다.
RUN addgroup -S app && adduser -S app -G app
# 헬스체크에 쓴다. alpine JRE 이미지에는 curl 도 wget 도 없다.
RUN apk add --no-cache wget
USER app

ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC"
EXPOSE 8080

# 컨테이너 메모리에 맞춰 힙을 잡도록 JAVA_OPTS 를 셸 확장으로 넘긴다.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]

FROM runtime-base AS api
COPY --from=backend-api --chown=app:app /app/build/libs/*.jar app.jar

# 기본 타깃. 아무것도 지정하지 않으면 이것이 만들어진다.
FROM runtime-base AS allinone
COPY --from=backend-full --chown=app:app /app/build/libs/*.jar app.jar
