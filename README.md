# smaGukji — 천하결전 오피스

삼국지 전략게임 *천하결전* 의 **부대 편성 분석**과 **동맹 인사관리** 도구입니다.
Spring Boot 백엔드 + React 프론트엔드 + Supabase(PostgreSQL) 구성입니다.

## AI 오피스 — 4개 팀

화면은 4개 팀으로 나뉘며, 팀 구성·직원·대사는 전부 DB(`agent_team` / `agent_staff` / `agent_thought`)에 있습니다.
소스코드를 고치지 않고 문구를 바꿀 수 있습니다.

| 팀 | 담당 | 화면 |
|---|---|---|
| 🎲 시뮬팀 | 부대 편성 시뮬레이션, 발동 확률 계산 | `/builder` |
| 📋 인사팀 | 동맹원 주차 시트 적재, 마커·주의 관리 | `/hr` |
| ♟️ 전략팀 | 세력·병종 구성 집계 | `/strategy` |
| 💡 기획팀 | 데이터 보강 우선순위 | `/planning` |

> **이 오피스는 LLM을 호출하지 않습니다.** 직원은 DB에 저장된 문구로 움직이는 표시용이고,
> 실제 계산은 각 팀이 가리키는 화면이 수행합니다.

## 구성

| | 스택 | 위치 |
|---|---|---|
| 백엔드 | Spring Boot 4.1 / Java 17 / Gradle (Kotlin DSL) | [backend/](backend/) |
| 프론트엔드 | React 19 / TypeScript / Vite 8 | [frontend/](frontend/) |
| DB | Supabase PostgreSQL 17.6 (`ap-south-1`) | Flyway 마이그레이션 |

## 실행

```bash
# 1) 환경변수 준비 (최초 1회)
cp .env.example .env      # 값 채우기. 자세한 내용은 아래 "환경변수" 참고

# 2) 백엔드 (http://localhost:8080)
cd backend && ./gradlew bootRun

# 3) 프론트엔드 (http://localhost:5173)
cd frontend && npm install && npm run dev
```

프론트엔드는 `/api` 요청을 백엔드로 프록시하므로 개발 중에는 CORS를 타지 않습니다.

### Windows 주의사항

- **`JAVA_HOME`** 이 JDK 루트를 정확히 가리켜야 합니다. 한 단계 위를 가리키면 Gradle이
  `JAVA_HOME is set to an invalid directory` 로 실패합니다.
  ```
  setx JAVA_HOME "C:\Program Files\Java\jdk-17.0.16_windows-x64_bin\jdk-17.0.16"
  ```
- **`.env` 의 한글 값은 `\uXXXX` 로 이스케이프** 해야 합니다. Spring Boot는 `.properties`
  형식 파일을 ISO-8859-1로 읽기 때문에 한글을 그대로 쓰면 깨집니다.
  예: `천하결전` → `\uCC9C\uD558\uACB0\uC804`
- **PowerShell 5.1은 BOM 없는 `.ps1` 을 ANSI로 읽습니다.** [tools/](tools/) 의 스크립트를
  수정할 때 UTF-8 BOM을 유지하세요.

## 환경변수

[.env.example](.env.example) 참고. 핵심은 세 가지입니다.

```properties
SUPABASE_DB_URL=jdbc:postgresql://aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require
SUPABASE_DB_USER=postgres.<project-ref>
SUPABASE_DB_PASSWORD=<db-password>
```

> **direct 연결(`db.<ref>.supabase.co`)은 쓰지 마세요.** AAAA(IPv6) 레코드만 존재하는데
> 대부분의 국내 환경은 IPv6 아웃바운드가 없어 연결되지 않습니다. session pooler(5432)를 쓰세요.
> transaction pooler(6543)를 쓸 경우 URL에 `&prepareThreshold=0&preparedStatementCacheQueries=0`
> 을 반드시 붙여야 합니다.

## DB 스키마

Flyway가 소유합니다 (`backend/src/main/resources/db/migration`). Hibernate는 스키마를
건드리지 않습니다(`ddl-auto=none`). 매핑 드리프트를 확인하려면 `JPA_DDL_AUTO=validate` 로 실행하세요.

| 마이그레이션 | 내용 |
|---|---|
| `V1__baseline` | `pgcrypto`, `set_updated_at()` 트리거 함수, `app_user` |
| `V2__asset_image` | 카드 이미지 원본 (`bytea`) |
| `V3__general_and_tactic` | `general`(장수), `tactic`(전법) |
| `V4__team` | `team`, `team_slot`, `team_slot_tactic` (부대 편성) |
| `V5__seed_generals_and_tactics` | 장수 54 + 전법 77 시드 (자동 생성) |
| `V6__alliance_and_member_week` | `alliance`, `member_week`, `member_marker`, `caution_note` |
| `V7__account_and_session` | `app_account`, `app_session` (인사팀 로그인) |
| `V8__agent_team` | `agent_team`, `agent_staff`, `agent_thought` + 4개 팀 시드 |
| `V9__menu_item` | `menu_item` (화면 메뉴 노출 제어) |
| `V10__role_and_menu_permission` | 역할 3단계(ADMIN/OFFICER/MEMBER) + `menu_item.allowed_roles` |
| `V11__tighten_default_menu_roles` | 기본 메뉴 권한 보정 |

모든 테이블에 RLS가 켜져 있고 정책은 없습니다. 백엔드는 테이블 소유자인 `postgres` 역할로
접속해 RLS의 영향을 받지 않고, PostgREST(anon/authenticated)는 전부 차단됩니다.
프론트에서 supabase-js로 직접 읽을 테이블이 생기면 그때 해당 테이블에만 select 정책을 추가하세요.

### 시드 재생성

장수/전법 이름은 **카드 이미지 파일명에서 생성**합니다. 손으로 옮겨 적으면 한글 오타가 나고
`asset_image.name` 과 어긋나 이미지 연결이 끊기기 때문입니다.

```powershell
.\tools\generate-seed.ps1
```

## 데이터 현황

| 항목 | 상태 | 출처 |
|---|---|---|
| 장수 이름 (54) | ✅ | 카드 이미지 파일명 |
| 장수 세력 | ✅ | 카드 이미지 좌상단 배지 판독 |
| 장수 코스트 | ✅ 전원 5.0 | 카드 이미지 하단 판독 |
| 장수 병종 | ❌ 미입력 | 카드 아이콘이 20px 남짓이라 판독 불가 |
| 장수 수치 | ❌ 미입력 | 카드 이미지에 없음 |
| 전법 이름 (77) | ✅ | 카드 이미지 파일명 |
| 전법 상세 | ❌ 미입력 | 카드 이미지에 없음 |
| 카드 이미지 (131) | ✅ | `asset_image` 테이블 (`bytea`, 약 14MB) |

**미입력 항목은 추측으로 채우지 않았습니다.** 그럴듯하지만 틀린 값이 들어가면 분석 결과가
조용히 잘못되기 때문입니다. 분석 API는 미입력을 "모름"으로 처리하고 `confidence` 로 알립니다.

### 데이터 채우기

프론트엔드 **«데이터»** 탭 또는 CSV API를 사용합니다.

```bash
curl -X POST http://localhost:8080/api/tactics/import \
  -H "Content-Type: text/csv" --data-binary @tactics.csv
```

```csv
name,category,abilityType,quality,triggerRate,targetCount,source,roleTags,effectText
강습,액티브,병기,보라,80,1,전수,딜_병기,"일반 공격 후 랜덤 적군 단일에게 이번 공격 80%의 피해를 준다"
```

- 이름이 기존 마스터와 일치하는 행만 갱신합니다. 새 이름은 만들지 않습니다.
- 빈 칸은 "변경 없음"입니다.
- 한글 값(`액티브`, `병기`, `황금`, `전수`, `기병`)을 그대로 인식합니다.
- 역할 태그 여러 개는 `|` 로 구분합니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/generals?faction=SHU` | 장수 목록 |
| `PATCH` | `/api/generals/{id}` | 장수 부분 수정 |
| `POST` | `/api/generals/import` | 장수 CSV 일괄 입력 |
| `GET` | `/api/tactics` | 전법 목록 |
| `GET` | `/api/tactics/completeness` | 전법 상세 입력률 |
| `PATCH` | `/api/tactics/{id}` | 전법 부분 수정 |
| `POST` | `/api/tactics/import` | 전법 CSV 일괄 입력 |
| `GET` | `/api/teams` · `POST` · `PUT` · `DELETE` | 부대 CRUD |
| `GET` | `/api/teams/{id}/analysis?turns=8&iterations=20000&seed=42` | 저장된 부대 분석 |
| `POST` | `/api/teams/analyze` | 저장 없이 편성안 즉석 분석 |
| `GET` | `/api/assets/{category}/{name}/image` | 카드 이미지 (ETag + 30일 캐시) |
| `POST` | `/api/assets/import` | 로컬 폴더에서 이미지 재적재 (sha256 비교, 멱등) |
| `GET` | `/api/agent/teams` | AI 오피스 4개 팀 + 직원 + 대사 |

### 인사팀 (`X-Session-Token` 헤더 필요 — 표시된 것 제외)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/hr/auth/bootstrap-status` | 관리자 계정 존재 여부 *(인증 불필요)* |
| `POST` | `/api/hr/auth/bootstrap` | 최초 관리자 생성 *(관리자 0명일 때만)* |
| `POST` | `/api/hr/auth/admin-gate` | 1단계 관리자 ID 확인 *(인증 불필요, 동맹명만 반환)* |
| `POST` | `/api/hr/auth/login` | 2단계 동맹원 ID/PW 인증 → 토큰 |
| `POST` | `/api/hr/auth/admin-login` | 관리자 로그인 → 토큰 |
| `POST` | `/api/hr/auth/accounts` | 계정 생성 *(ADMIN 전용)* |
| `GET` | `/api/hr/members?server=&alliance=&snapshotDate=` | 그리드 조회 |
| `POST` | `/api/hr/members/import?server=&alliance=` | 시트 업로드 (multipart) |
| `GET` | `/api/hr/markers/meta` | 마커 코드·라벨·색 *(인증 불필요)* |
| `POST` | `/api/hr/markers?server=&alliance=` | 마커 토글 |
| `GET` | `/api/hr/cautions?server=&alliance=&q=&onlyOpen=` | 주의 목록 · 검색 |
| `POST` | `/api/hr/cautions?server=&alliance=` | 주의 사유 추가 |
| `POST` | `/api/hr/cautions/{id}/resolve` | 주의 해제 (기록은 유지) |

## 인사팀 — 동맹원 관리

### 로그인 · 회원가입

로그인하기 전에는 아무 메뉴도 보이지 않고 로그인 화면만 뜹니다.

**회원가입** 시 서버와 동맹 이름을 함께 입력합니다.

- 처음 등록하는 동맹 → 가입자가 그 동맹의 **관리자**가 됩니다.
- 이미 등록된 동맹 → **동맹원**으로 합류합니다. (모르는 사람이 남의 동맹 관리자가 되는 것을 막습니다)

이후 역할 변경은 관리자가 «관리자» 화면에서 합니다.

### 권한 3단계

| 역할 | 권한 |
|---|---|
| **관리자** (`ADMIN`) | 메뉴 권한 설정 · 계정 관리 · 전체 화면 |
| **간부진** (`OFFICER`) | 인사 탭 관리(동맹원·마커·주의·시트 적재)만 |
| **동맹원** (`MEMBER`) | 시뮬레이션만 |

어떤 역할에게 어떤 메뉴를 보일지는 소스코드가 아니라 DB(`menu_item.allowed_roles`)에 있고,
관리자가 «관리자» 화면에서 버튼으로 켜고 끕니다. 되돌릴 방법이 사라지지 않도록 관리자는 항상 포함됩니다.

기본값:

| 메뉴 | 관리자 | 간부진 | 동맹원 |
|---|:--:|:--:|:--:|
| 인사팀 · 동맹원 | ● | ● | |
| 시뮬팀 · 편성 | ● | | ● |
| AI 오피스 · 전략팀 · 기획팀 · 장수 · 전법 · 데이터 | ● | | |

> 🔒 **이 계정은 이 앱 전용입니다. 게임 계정 자격증명을 받지 않습니다.**
> 비밀번호는 BCrypt 해시로만 저장하며, `app_account.password_hash` 에
> `^\$2[aby]\$\d{2}\$.{53}$` 체크 제약이 걸려 있어 평문이 들어가면 INSERT 자체가 실패합니다.
> 세션 토큰도 원문이 아니라 SHA-256 해시만 저장합니다.

### 주차 시트 적재

`MemberWeek<YYYYMMDD>.xlsx` 를 업로드하면 **파일명에서 기준일을 읽어** 그 날짜로 적재합니다.
(`MemberWeek20260814.xlsx` → `2026-08-14`)

| 시트 컬럼 | DB 컬럼 |
|---|---|
| 캐릭터 ID | `cid` (문자열 — 앞자리 0 보존) |
| 멤버 | `member_name` |
| 직업 | `job` |
| 조별 | `team_group` |
| 직위 | `position` |
| 번영 | `prosperity` |
| 주간 무훈 | `weekly_merit` |
| 주간 공헌 | `weekly_contribution` |
| 주둔지 | `garrison` |
| 주 공성 횟수 | `weekly_siege_count` |

- 컬럼은 **순서가 아니라 헤더 이름**으로 찾습니다. 게임 쪽에서 순서를 바꿔도 깨지지 않습니다.
- 같은 (동맹, 일자, cid) 는 **덮어씁니다.** 재업로드해도 행이 늘지 않고 마커·주의는 보존됩니다.

### 마커

cid 단위로 붙으므로 어느 주차를 보든 따라옵니다. 버튼으로 켜고 끄며, 끌 때 행을 지우지 않고
`enabled` 만 내려서 "누가 언제 켰다 껐는지"를 남깁니다.

| 마커 | 색 | 사유 |
|---|---|---|
| 주의 | 주황 `#e8863a` | **켤 때 사유 필수** — 모달에서 입력 |
| 길작러 | 초록 `#3fa15e` | 불필요 |
| 액티브 | 파랑 `#3f7fd0` | 불필요 |

주의 사유는 한 사람에게 여러 건 쌓이고 **지워지지 않습니다.** «해제»는 `resolved` 플래그만 세웁니다.
«주의» 화면에서 멤버명 또는 cid로 검색해 이력을 볼 수 있습니다.

## 분석 시스템

`POST /api/teams/analyze` 는 다음을 계산합니다.

- **코스트** — 합계 / 상한 / 초과 여부
- **세력** — `PURE`(3인 동일) / `PAIR`(2인 동일) / `SCATTERED`(전원 상이)
- **병종** — 단일/혼성. 미입력이면 신뢰 불가로 표시
- **전법 구성** — 분류·능력타입·품질 분포, 평균 발동확률, 중복 장착 검출
- **발동 시뮬레이션** — 몬테카를로. 턴당 기대 발동 수, 최소 1개 발동 확률,
  한 턴 발동 개수 분포, 전법별 총 기대 발동. 같은 `seed` 면 결과가 재현됩니다.
- **점수** — 0~100 + 등급

### 점수를 읽는 법

미입력 항목은 채점에서 **제외**합니다. 0점 처리하면 "데이터를 안 넣어서 낮은 점수"와
"실제로 나쁜 편성"이 구분되지 않기 때문입니다.

다만 제외만 하면 *모르는 것*이 *좋은 것*으로 둔갑합니다. 그래서 두 값을 함께 줍니다.

- `scoreCoverage` — 채점 모델 중 실제로 평가한 배점 비중 (%)
- `confidence` — `HIGH`(≥95%) / `MEDIUM`(≥80%) / `LOW`(<80%)

**`confidence` 가 `LOW` 인 점수는 편성의 우열이 아니라 데이터 입력 상태를 반영한 값입니다.**
현재 전법 상세가 0% 입력이라 대부분의 편성이 `LOW` 로 나옵니다.

## 테스트

```bash
cd backend && ./gradlew test --tests "com.smagukji.backend.service.*"
```

`BackendApplicationTests` 는 실제 Supabase에 연결하므로 위처럼 단위 테스트만 지정해 돌리는 편이 빠릅니다.

## 데이터 출처에 관하여

- 카드 이미지는 사용자 로컬 폴더(`ASSET_SOURCE_DIR`)에서 가져옵니다.
- 장수 세력·코스트는 그 이미지에서 판독했습니다.
- **`3000sim.xyz` 크롤링은 하지 않습니다.** 해당 사이트의 `robots.txt` 가 `ClaudeBot` 을
  명시적으로 지정해 전체 경로를 차단하고 있습니다. 데이터가 필요하면 사이트를 직접 이용해
  받은 내용을 위 CSV 형식으로 넣으세요.
