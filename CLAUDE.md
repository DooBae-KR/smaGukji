# CLAUDE.md — smaGukji (천하결전 덱 시뮬레이터)

이 파일은 저장소 루트에 두는 Claude 작업 규칙이다. 세션이 바뀌어도 같은 실수를 반복하지 않기 위해 쓴다.
설명은 항상 **한국어**로 한다.

## 명령 모드
- `-plan` : 플랜 모드. 코드를 고치지 않고 흐름·구조를 정한다. 사용자가 해야 할 설정은 Notion «천하결전 › 작업리스트» 에 항목으로 만들고 댓글로 알린다.
- `-dev`  : 개발 모드(bypassPermissions). 승인된 플랜대로 구현·테스트한다. 사용자가 작업리스트 항목을 체크하면 다음 단계로 이어간다.
- 플랜 문서: 프로젝트 «시뮬레이션 만들기» 의 `claude/plan.md`, 진행 상태 `claude/status.md`. **새 플랜을 짜기 전에 반드시 `git status` 로 미커밋 작업부터 확인**한다(2026-08-25 에 로컬 미커밋 작업을 모른 채 플랜을 짜서 V27 번호·티어표 파서·배포처가 전부 겹쳤다).

## 작업 방식 (Cowork ↔ 로컬 폴더 `D:\프로젝트\smaGukji`)
- Cowork 세션은 이 폴더에 **파일을 쓸 수만** 있다. `git commit` / `git push` 는 두배가 터미널에서 한다. Claude 는 커밋 메시지 초안을 채팅에 준다.
- Cowork 의 장치 셸에서 **인덱스를 쓰는 git 명령(`git status`, `git add`, `git checkout`, `git stash` 등)을 실행하지 않는다.** 장치 셸은 파일을 지우지 못해 `.git/index.lock` 이 남고, 이후 모든 git 명령이 막힌다. `git diff` 도 `--no-optional-locks` 를 줘도 lock 을 남긴다(실측). 장치 셸에서는 `git log` / `git ls-files` / `git show HEAD:경로` 만 쓰고, 변경 비교는 클라우드 사본에서 한다. 남은 lock 은 `.tmp/_to_delete/` 로 `mv` 해서 치운다.
- 클라우드 세션에서 GitHub 푸시는 403 이다(저장소가 세션 소스에 없음). **다시 시도하지 않는다.** 검증은 클라우드에 `git clone` 한 사본에서 하고, 결과 파일만 폴더로 쓴다.
- 폴더에 쓰기 전에 항상 그 파일의 최신 내용을 다시 읽는다(두배가 그 사이 고쳤을 수 있다).

## 스택
- backend: Spring Boot / Java 17 / Gradle Kotlin DSL. Flyway 가 스키마를 소유(`ddl-auto=none`). 마이그레이션은 `backend/src/main/resources/db/migration/V<N>__*.sql`.
- frontend: React 19 / TypeScript / Vite 8. 라우터 없음(`App.tsx` 의 route 문자열 + `menu_item` 테이블). 읽기·저장은 supabase-js 직접(RLS). 백엔드는 «버튼 눌러서 하는 일» 만: 시트 동기화(`/api/sheets/sync`), CSV import, 인사 xlsx 업로드(Apache POI), 자산 카운트.
- 편성 분석(`lib/analyze.ts`)·덱 추천(`lib/recommend.ts`)·전법 계수 파싱(`lib/effect.ts`)·티어덱(`lib/tier.ts` + `generated/tier-decks.json`)·전보 OCR(`lib/ocr.ts`, `lib/readReport.ts`, tesseract.js) 은 **전부 브라우저에서 돈다.** 서버가 잠들어도 화면이 죽지 않게 하기 위해서다.
- DB: Supabase Postgres (project ref `yzjbaenqfnyqfoaxqegu`, ap-south-1). 반드시 session pooler 5432. 마이그레이션 현재 최고 번호: **V27 = battle_report(전보)** (미커밋, 로컬). 다음 번호는 V28 부터.
- 배포: Netlify(프론트, https://samgukji.netlify.app — `www.` 없이) + Supabase + 백엔드는 현재 Render(https://smagukji.onrender.com, 잠듦). 이전 대상은 `deploy/README.md` 의 결정대로 **Oracle Always Free(A안, `deploy/oracle/`) → 막히면 Northflank(B안)**. Cowork 플랜이 제안했던 Koyeb Free 는 «도메인·카드 없이 5분 안에 끝나는 C안» 으로만 남겨 둔다. 무료 티어만 쓴다.
- CI: `.github/workflows/build.yml` (main 푸시 시 테스트 → 프론트 빌드 → Docker → GHCR `ghcr.io/doobae-kr/smagukji:latest`). Dockerfile 스테이지 이름을 바꾸면 이 파일의 `--target` 도 같이 바꾼다(2026-08-25: `backend` → `backend-api`).

## 데이터 출처 (구글 시트 `1UOtQR7PvI5qJwLeFbq-RErRRKBwl-JjXhsK53JXLzAA`)
| 탭 | 접근 | 쓰는 곳 |
|---|---|---|
| 장수 | `export?format=csv&gid=817745317` | `GENERAL_SHEET_CSV_URL` |
| 이름 마스터 | `gid=950460335` | `ROSTER_SHEET_CSV_URL` |
| 전법 / 버프 / 열전 | `gviz/tq?tqx=out:csv&sheet=<탭이름 URL인코딩>` (gid 없이 이름으로) | `TACTIC_` / `BUFF_` / `BOND_SHEET_CSV_URL` |
| 시즌2 티어표 | `gid=2052638695`, 병합셀 격자 | `tools/export-tier-decks.js` → `frontend/src/generated/tier-decks.json` (빌드 전 로컬 실행, 결과 커밋) |
| 전보(전투 기록) 시트 | `gid=714472251` (헤더: 시간, 승패결과, U1_닉네임, U1_잔류병력, U1_장수1_명 …) | 아직 미사용. 앱의 `battle_report` 와 같은 정보 |
| 티어정보(헬퍼) | `gid=1628422466` | 미사용 |
| 멤버 / 무훈 / 부대 | `gid=404427670` / `266611855` / `0` | 인사 화면은 xlsx 업로드로 받는다 |
- 카드 이미지: 드라이브 `16_5ihzT6w9pl5PomRYBjR50mPZDAh4Zm` (장수/ 전법/ 각 시즌2/). `tools/import-card-images.js` → `asset_image` → `tools/export-card-images.js` → `frontend/public/cards/` + `generated/card-images.json`.

## 절대 다시 하지 말 것 (이미 겪은 오류)
1. 시트 값을 마이그레이션에 스냅샷으로 굽지 않는다. V13 이 편집 중인 시트를 찍어 V14 로 되돌렸다. 시트는 동기화 API 나 `tools/export-*.js` 로만 읽는다.
2. 시트에만 있는 이름으로 장수를 만들지 않는다(세력·이미지 없음 → 유령 장수). 매핑표에 없는 값은 추측하지 않고 건너뛰고 경고한다.
3. 시즌2 티어표 탭은 병합셀 격자라 머리글 기반(`SheetColumns`)으로 읽을 수 없다. 라벨 탐색 파서(`tools/export-tier-decks.js`)를 쓴다. Java 쪽에 같은 파서를 또 만들지 않는다.
4. 발동률 `100%%` 는 시트 오타이므로 `%%`→`%` 로 정규화해 100 으로 읽는다(사용자 결정). 그 외 해석 불가 값은 null + 경고.
5. 새 테이블은 V21 이후 기본 권한이 없다. RLS 켜기 + 정책 + `grant … to authenticated` 를 매번 명시한다(V26·V27 패턴). Storage 버킷은 SQL 마이그레이션으로 만들 수 없으니 대시보드 작업을 작업리스트에 올린다.
6. 마이그레이션에서 `flyway_schema_history` 를 건드리지 않는다(락 데드락). 후처리는 `SchemaHardening` 에서.
7. 이미 배포된 마이그레이션 파일은 **줄바꿈조차 바꾸지 않는다.** 2026-08-25 V5 가 CRLF 로 바뀌어 있던 것을 원복했다.
8. Docker 프론트 스테이지는 `node:24-slim`. alpine(musl)은 Vite 8/rolldown 네이티브 바이너리가 없어 `npm ci` 가 실패한다.
9. `db.<ref>.supabase.co` direct 연결 금지(IPv6 전용). transaction pooler 6543 을 쓰면 `prepareThreshold=0` 필수.
10. `.env` 의 한글은 `\uXXXX` 로 이스케이프(ISO-8859-1). 값은 따옴표 없이.
11. `SUPABASE_URL` 이 비면 `/api` 전체가 잠긴다(의도된 fail-closed). 호스팅 환경변수에 반드시 넣는다.
12. 백엔드가 잠들어 있어도 화면이 죽지 않게, 사람이 기다리는 읽기·저장 경로는 Supabase 직접 접근으로 둔다. 새 화면을 만들 때 백엔드 API 를 먼저 떠올리지 않는다.
13. 환경변수 목록은 `.env.example` · `DEPLOY.md` · `deploy/oracle/.env.example` · 호스팅 설정을 같이 고친다(예전에 `render.yaml` 에 TACTIC/BUFF 가 빠져 있었다).
14. 프론트 `labels.ts` 는 백엔드 enum 라벨과 손으로 맞춘다. `analyze.ts` 의 채점 규칙은 `TeamAnalysisService.java` 와 같아야 한다 — 한쪽만 고치지 않는다.
15. «코스트» 개념은 이 게임에 없다. 다시 넣지 않는다.
16. 3000sim.xyz 는 robots.txt 로 ClaudeBot 을 차단한다. 크롤링하지 않는다.
17. `API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'` — `??` 를 쓰면 빈 문자열이 값으로 들어가 요청이 `/hr/...` 로 나간다(인사 업로드 401 원인 중 하나).
18. 전법 효과·전보 판독처럼 «추정» 이 섞이는 값은 확신도나 «표본 수» 를 반드시 같이 보여준다. 5전 미만 승률을 추천 근거로 쓰지 않는다.
19. Notion 댓글에 붙은 이미지는 Claude 가 읽지 못한다. 스크린샷은 채팅으로 받는다.
20. 프론트 새 화면은 `App.tsx` 의 route 추가만으로 열리지 않는다. `menu_item` 행(마이그레이션)이 없으면 첫 메뉴로 튕긴다(`/report` 가 그 상태).
21. `render-deploy.sh` 는 로컬 `.env` 의 값을 **통째로** Render 환경변수에 덮어쓴다. `CORS_ALLOWED_ORIGINS` 에 `https://samgukji.netlify.app` 이 없으면 Netlify 화면의 백엔드 호출(인사 시트 업로드)이 전부 «Failed to fetch» 가 된다(2026-08-22 배포에서 발생, 08-25 수정·스크립트가 이제 막음). 백엔드 호스팅을 옮겨도 이 변수는 첫 번째로 확인한다.
22. 인사 시트 숫자 칸은 «14만» 같은 축약 표기가 대부분이다. `MemberWeekImportService.parseNumber()` 가 만·억 단위를 읽는다. `BigDecimal` 직접 파싱으로 되돌리면 무훈이 조용히 null 이 된다.

## 테스트
- backend: `cd backend && ./gradlew test --tests "com.smagukji.backend.service.*"` (BackendApplicationTests 는 실제 DB 접속이라 CI 제외)
- frontend: `cd frontend && npm run build` (tsc -b + vite build). 2026-08-25 로컬 미커밋 상태로 통과 확인.
