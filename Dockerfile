# 프론트엔드와 백엔드를 하나의 이미지로 묶는다.
# 프론트는 백엔드 JAR 의 static/ 에 들어가 같은 오리진에서 서빙되므로 CORS 가 필요 없다.
#
#   docker build -t smagukji .
#   docker run -p 8080:8080 --env-file .env -e SPRING_PROFILES_ACTIVE=prod smagukji

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
RUN npm run build

# ---------------------------------------------------------------
# 2) 백엔드 빌드 (+ 프론트 산출물 주입)
# ---------------------------------------------------------------
FROM eclipse-temurin:17-jdk AS backend
WORKDIR /app

# Gradle 래퍼와 빌드 스크립트만 먼저 복사해 의존성 캐시를 만든다.
COPY backend/gradlew backend/gradlew.bat ./
COPY backend/gradle ./gradle
COPY backend/build.gradle.kts backend/settings.gradle.kts ./
# Windows 에서 커밋되면 CRLF 와 실행권한 문제가 생기므로 여기서 정리한다.
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew \
    && ./gradlew --version --no-daemon

COPY backend/src ./src
# 프론트 빌드 결과를 정적 자원으로 넣는다. (Gradle 의 -PbuildFrontend 는 쓰지 않는다)
COPY --from=frontend /app/dist ./src/main/resources/static

RUN ./gradlew bootJar --no-daemon -x test

# ---------------------------------------------------------------
# 3) 런타임
# ---------------------------------------------------------------
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# root 로 돌리지 않는다.
RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=backend --chown=app:app /app/build/libs/*.jar app.jar

ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC"

EXPOSE 8080

# 컨테이너 메모리에 맞춰 힙을 잡도록 JAVA_OPTS 를 셸 확장으로 넘긴다.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
