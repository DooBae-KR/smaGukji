# 배포 가이드

프론트엔드를 백엔드 JAR 안(`static/`)에 담아 **하나의 서비스로 배포**합니다.
같은 오리진에서 서빙되므로 CORS 설정이 필요 없고, 배포 대상도 하나뿐입니다.

```
브라우저 ──► [ Spring Boot JAR ]  ──► Supabase (PostgreSQL)
              ├─ /            React SPA
              ├─ /api/**      REST API
              └─ /actuator/health
```

## 준비물

- Supabase 접속 정보 3개 (`SUPABASE_DB_URL` / `SUPABASE_DB_USER` / `SUPABASE_DB_PASSWORD`)
- 호스팅 계정 (아래 중 하나)

> DB는 이미 Supabase에 있으므로 따로 올릴 것이 없습니다. 앱만 배포하면 됩니다.

---

## 방법 1 — Render (가장 간단, 무료 플랜 있음)

### 1-A. 스크립트로 (브라우저 없이)

저장소가 public 이라 GitHub App 연동 없이 API 만으로 배포됩니다.

```bash
# 1) https://render.com 가입 (GitHub 계정으로 하면 빠름)
# 2) Account Settings → API Keys → Create API Key
# 3) .env 에 추가:  RENDER_API_KEY=rnd_xxxxxxxx
./render-deploy.sh
```

서비스 생성, 환경변수 주입, 빌드 대기, 헬스체크까지 한 번에 처리합니다.
이미 서비스가 있으면 환경변수를 갱신하고 재배포만 겁니다.

### 1-B. 대시보드에서 직접

1. https://render.com 가입 후 GitHub 저장소 연결
2. **New → Blueprint** → 이 저장소 선택 → [render.yaml](render.yaml)을 자동으로 읽습니다
3. **Environment** 탭에서 값 3개를 직접 입력 (`sync: false`로 표시된 항목)
   ```
   SUPABASE_DB_URL       jdbc:postgresql://aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require
   SUPABASE_DB_USER      postgres.yzjbaenqfnyqfoaxqegu
   SUPABASE_DB_PASSWORD  (Supabase DB 비밀번호)
   ```
4. **Deploy**

배포되면 `https://smagukji.onrender.com` 형태의 주소가 나옵니다.

> 무료 플랜은 15분간 요청이 없으면 잠들고, 다음 첫 요청이 30초 이상 걸립니다.
> 상시 가동이 필요하면 유료 플랜으로 올리세요.

## 방법 2 — Fly.io

```bash
# 1) CLI 설치 후 로그인
fly auth login

# 2) 앱 생성 (fly.toml 을 그대로 쓰겠다고 답합니다)
fly launch --no-deploy

# 3) 비밀값 주입 — 파일이 아니라 secret 으로 들어갑니다
fly secrets set \
  SUPABASE_DB_URL="jdbc:postgresql://aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  SUPABASE_DB_USER="postgres.yzjbaenqfnyqfoaxqegu" \
  SUPABASE_DB_PASSWORD="…"

# 4) 배포
fly deploy
```

설정은 [fly.toml](fly.toml)에 있습니다. `min_machines_running = 0`이라 안 쓸 때는 멈춰 비용이 들지 않습니다.

## 방법 3 — Docker (로컬 / 직접 서버 / NAS / VPS)

가장 간단한 방법:

```bash
./docker-run.sh           # 이미지를 빌드해서 실행
./docker-run.sh --pull    # CI 가 GHCR 에 올려둔 이미지를 받아서 실행 (빠름)
```

직접 명령으로 하려면:

```bash
docker build -t smagukji .

docker run -d --name smagukji -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e SUPABASE_DB_URL="jdbc:postgresql://…" \
  -e SUPABASE_DB_USER="postgres.…" \
  -e SUPABASE_DB_PASSWORD="…" \
  -e APP_MIN_PASSWORD_LENGTH=8 \
  smagukji
```

## 방법 4 — JAR 직접 실행

```bash
cd backend
./gradlew bootJar -PbuildFrontend        # 프론트까지 포함해서 빌드

SPRING_PROFILES_ACTIVE=prod \
SUPABASE_DB_URL="…" SUPABASE_DB_USER="…" SUPABASE_DB_PASSWORD="…" \
java -jar build/libs/backend-0.0.1-SNAPSHOT.jar
```

`-PbuildFrontend` 없이 빌드하면 백엔드만 들어갑니다(개발 중 빠른 반복용).

---

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|:--:|---|---|
| `SUPABASE_DB_URL` | ● | | JDBC URL. **session pooler(5432)** 를 쓰세요 |
| `SUPABASE_DB_USER` | ● | | `postgres.<project-ref>` |
| `SUPABASE_DB_PASSWORD` | ● | | Supabase DB 비밀번호 |
| `SPRING_PROFILES_ACTIVE` | | `default` | 배포 시 `prod` |
| `APP_MIN_PASSWORD_LENGTH` | | `4` | **공개 배포 시 8 이상 권장** |
| `CORS_ALLOWED_ORIGINS` | | (prod에선 비움) | 프론트를 별도 도메인에 둘 때만 |
| `DB_POOL_MAX_SIZE` | | `5` | 512MB 인스턴스면 `3` |
| `PORT` / `SERVER_PORT` | | `8080` | 플랫폼이 주입하기도 합니다 |
| `GENERAL_SHEET_CSV_URL` | | | 무장 분류 시트(CSV export). «데이터» 탭 불러오기 버튼용 |
| `ROSTER_SHEET_CSV_URL` | | | 장수·전법 이름 마스터 시트(CSV export) |

> ⚠️ **비밀값을 `render.yaml` / `fly.toml` / `Dockerfile` 에 넣지 마세요.** 전부 커밋되는 파일입니다.
> `.dockerignore` 가 `.env` 를 이미지에서 제외합니다.

---

## 공개 전 점검

- [ ] **`APP_MIN_PASSWORD_LENGTH=8` 이상** — 현재 `admin1234`/`cjswhrnr` 계정은 4~9자 비밀번호를 쓰고 있습니다. 공개 주소가 생기면 **먼저 비밀번호부터 바꾸세요.** 로그인 후 `POST /api/hr/auth/password` 또는 화면에서 변경합니다.
- [ ] `admin1234` / `admin1234` 처럼 **ID와 비밀번호가 같은 계정은 반드시 변경** — 공개 인터넷에서는 몇 초 만에 뚫립니다.
- [ ] `SPRING_PROFILES_ACTIVE=prod` 확인 — SQL 로그가 꺼지고 액추에이터가 `health` 만 열립니다.
- [ ] Supabase **session pooler(5432)** 사용 확인. direct 연결은 IPv6 전용이라 대부분의 호스팅에서 실패합니다.
- [ ] 무료 티어 메모리(512MB)면 `DB_POOL_MAX_SIZE=3`.

## 동작 확인

```bash
curl https://<배포주소>/actuator/health     # {"status":"UP"}
curl https://<배포주소>/api/menus           # []  (비로그인이면 빈 배열이 정상)
```

브라우저로 접속하면 로그인 화면이 뜹니다. `/hr`, `/builder` 같은 주소를 직접 쳐도 SPA 라우팅이 동작합니다.

## 로컬에서 운영 구성 그대로 확인하기

```bash
cd backend && ./gradlew bootJar -PbuildFrontend
cd .. && SPRING_PROFILES_ACTIVE=prod java -jar backend/build/libs/backend-0.0.1-SNAPSHOT.jar
# → http://localhost:8080
```
