# 배포 — Render 를 떠나며

> **2026-09-04 갱신**: 이 문서가 짜던 Oracle/Northflank/Koyeb 이전 계획 대신, 실제로는
> 백엔드가 하던 일(시트 동기화·CSV import·인사 xlsx 업로드·자산 카운트)을 **Netlify Functions**
> 로 옮기고 Render 서비스는 지웠다. 아래 내용은 그 결정에 이르기까지의 기록으로 남겨 둔다
> (`render.yaml` / `render-deploy.sh` 는 저장소에서 삭제됨).

## 왜 옮기는가

Render 무료 인스턴스는 **유휴 15분이면 잠든다.** 깨는 데 수십 초가 걸리고, 그동안 편성·전보
화면이 멈춘 것처럼 보인다. 무중단이 최우선인 이상 맞지 않는다.

지금까지는 그걸 우회하려고 **조회는 Supabase, 계산은 화면에서** 하도록 옮겨 왔다. 편성 분석과
덱 추천, 전보 판독은 이제 Render 를 부르지 않는다. 그래도 남는 것이 있다.

| 아직 서버가 필요한 일 | 왜 |
|---|---|
| 인사 시트 업로드 | xlsx 파싱에 Apache POI 가 필요하다 |
| 구글 시트 동기화 | 시트 CSV 주소가 CORS 를 열어주지 않는다 |
| 부대 저장·조회 | 쓰기는 서버를 거친다 |
| AI 오피스 | `/agent/teams` 를 읽는다 |

이것들 때문에 서버는 계속 필요하고, 그 서버가 잠들면 안 된다.

## 어디로 갈 것인가

**Oracle Cloud Always Free 로 간다.** 아래 A 가 실제로 쓸 구성이다. B(Northflank)는 나중에 갈아탈 수 있게 남겨 둔다.

| | Northflank | Oracle Cloud Always Free |
|---|---|---|
| 잠드는가 | 아니오 | 아니오 |
| SSL | 자동 (관리형) | 직접 (nginx + certbot) |
| 도메인 | 하위 도메인을 준다 | **직접 있어야 한다** |
| 손이 가는 일 | 저장소 연결하면 끝 | VM·방화벽·OS 갱신·인증서 |
| 성능 | 작다 | 4 OCPU / 24GB — 훨씬 크다 |
| 걸리는 점 | 무료 한도가 빡빡하다 | ARM 인스턴스 재고가 자주 없다 |

**Oracle 의 대가**는 분명하다 — 인증서 갱신·OS 보안 갱신·방화벽 두 겹을 계속 돌봐야 한다.
대신 성능이 넉넉해, 나중에 딜량 공식을 역산하거나 전투 시뮬레이션을 서버에서 돌리게 되면
그때 값을 한다. 지금 서버가 하는 일은 «가끔 누르는 버튼» 뿐이라 성능은 남는다.

**막히면 B 로 간다.** ARM 인스턴스 재고가 없거나 도메인을 못 구하면 Northflank 가 대안이다.
같은 저장소로 바로 배포된다.

---

# A. Oracle Cloud Always Free

## 준비물

- Oracle Cloud 계정 (신용카드 확인이 필요하지만 Always Free 는 청구되지 않는다)
- **도메인 이름 하나** — Dynu 에서 무료로 받는다(아래 0번). Let's Encrypt 는 IP 주소에
  인증서를 발급하지 않으므로 이름이 반드시 있어야 한다.

## 0) 도메인 — 무료로 Dynu

Let's Encrypt 는 **IP 주소에 인증서를 발급하지 않는다.** 이름이 하나 있어야 한다.
도메인을 사지 않기로 했으므로 무료 서브도메인을 받는다. **Dynu** 를 쓴다.

1. https://www.dynu.com → **Sign Up** (이메일로 가입한다. OAuth 가 아니라 계정만 있으면 된다)
2. 로그인 후 **DDNS Services → Add** → 원하는 이름과 도메인을 고른다
   → 예: `smagukji.freeddns.org` 또는 `smagukji.dynu.net`
3. 인스턴스를 만든 뒤 그 **공인 IP** 를 `IPv4 Address` 에 넣고 저장한다
4. **Control Panel → Credentials** 에서 **IP Update Password** 를 만들어 적어 둔다
   (계정 비밀번호와 다르다. 갱신 전용이라 이게 새도 계정은 안전하다)

`dynu.net` · `freeddns.org` · `mywire.org` 는 **Public Suffix List** 에 올라 있어
**서브도메인마다 발급 한도가 따로** 잡힌다. 남이 많이 쓴다고 우리가 막히지 않는다.

### 왜 DuckDNS 가 아니라 Dynu 인가

둘 다 무료이고 Let's Encrypt 도 잘 붙는다. Dynu 를 고른 이유는 둘이다.

- **이메일로 가입한다.** DuckDNS 는 깃허브·구글 OAuth 만 된다.
- 나중에 진짜 도메인을 사면 **그것도 Dynu 에서 함께 관리**할 수 있다.

DuckDNS 를 쓰고 싶으면 그래도 된다. 아래 `.env` 의 `DOMAIN` 과 `DDNS_UPDATE_URL` 만
그쪽 값으로 바꾸면 나머지는 그대로다.

### Cloudflare Tunnel 은 왜 못 쓰나

포트를 하나도 안 열어도 되고 인증서도 자동이라 운영은 훨씬 편하다. 그런데
**Cloudflare 에 도메인 전체(zone)를 등록해야 한다** — 네임서버를 Cloudflare 로 바꿔야
하는데, 무료 서브도메인은 부모 도메인의 네임서버를 우리가 통제할 수 없다. 서브도메인만
얹는 기능은 Business 플랜 전용이다.

도메인 없이 쓸 수 있는 Quick Tunnel 은 주소가 `random-words-1234.trycloudflare.com` 이고
**재시작마다 바뀐다.** 동맹원에게 공유할 주소로는 못 쓴다.

> 나중에 도메인을 사면(연 5~15달러) 그때 Cloudflare Tunnel 로 갈아탈 수 있다. `.env` 의
> `DOMAIN` 만 바꾸고 인증서를 다시 받으면 되고, 도메인 값은 한 곳에만 있다.


## 1) 인스턴스 만들기

Compute → Instances → **Create instance**

| 항목 | 값 | 왜 |
|---|---|---|
| Region | **ap-seoul-1** 또는 **ap-chuncheon-1** | 국내라 접속이 빠르다. 계정 만들 때 고른 홈 리전에서만 Always Free 가 된다 |
| Image | **Ubuntu 22.04** (aarch64) | ARM 용 이미지를 골라야 한다 |
| Shape | **VM.Standard.A1.Flex** | Ampere ARM. Always Free 는 이것뿐이다 |
| OCPU / 메모리 | **2 OCPU / 12GB** (가능하면 4/24) | 아래 참고 |
| Boot volume | 50GB | Always Free 는 합쳐서 200GB 까지 |
| 공인 IP | **Assign a public IPv4** | 이게 없으면 바깥에서 못 들어온다 |
| SSH 키 | 공개키 업로드 또는 새로 생성 | 개인키를 잃으면 다시 못 들어간다. 잘 보관할 것 |

### 크기를 얼마로 할까

Always Free 한도는 **4 OCPU / 24GB** 이고, 여러 인스턴스에 나눠 쓸 수 있다. 하나에 몰아
쓰는 것이 낫다.

우리 부하는 크지 않다 — Spring Boot 하나와 nginx 하나다. **2 OCPU / 12GB 면 충분하다.**
다만 첫 빌드(프론트 npm + Gradle)가 메모리를 꽤 먹으므로 **1 OCPU / 6GB 아래로는 내리지
말 것.** 재고가 없어 4/24 를 못 잡으면 2/12 로 시작해도 된다. 나중에 늘릴 수 있다.

> **x86 마이크로 인스턴스(VM.Standard.E2.1.Micro)는 쓰지 말 것.** Always Free 로 2개를
> 주지만 메모리가 1GB 다. Spring Boot 를 띄우는 것도 빠듯하고 빌드는 확실히 죽는다.

> ARM 인스턴스는 재고가 없어 «Out of capacity» 가 자주 뜬다. 가용 도메인(AD)을 바꿔가며
> 시도하거나 시간을 두고 다시 하면 잡힌다.

### ⚠️ 유휴 회수 — 무중단이 걸린 문제

Oracle 은 **Always Free 계정의 인스턴스가 7일 동안 놀고 있으면 회수**한다. 판단 기준은
CPU 사용률 20% 미만 + 네트워크·메모리 사용이 낮은 상태다.

우리 앱은 동맹원 몇 명이 가끔 쓰는 정도라 **이 기준에 정확히 걸린다.** 잠들지 않으려고
Render 를 떠나왔는데 아예 지워지면 더 나쁘다.

피하는 방법은 하나다 — **계정을 Pay As You Go 로 올린다.** 카드가 등록되지만 Always Free
자원은 그대로 무료이고, 대신 **유휴 회수 대상에서 빠진다.** 무료 한도를 넘기지만 않으면
청구되지 않는다. Budget 알림을 걸어 두면 더 안전하다.


## 2) 방화벽 열기

Oracle 은 **두 겹**이다. 한쪽만 열면 안 된다.

**클라우드 쪽** — VCN → Security List → Ingress Rules 에 80, 443 추가 (0.0.0.0/0)

**인스턴스 쪽** — Ubuntu 이미지는 iptables 가 기본으로 막고 있다:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3) Docker 설치

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 그룹 반영을 위해 로그아웃 후 다시 접속
```

## 4) 도메인이 서버를 가리키게

Dynu 화면에서 `IPv4 Address` 에 인스턴스 공인 IP 를 넣고 저장한다.
그리고 `.env` 의 `DDNS_UPDATE_URL` 을 채워 두면, 뒤에 IP 가 바뀌어도 `ddns` 컨테이너가
5분마다 알아서 맞춰 준다.

```
DDNS_UPDATE_URL=https://api.dynu.com/nic/update?hostname=smagukji.freeddns.org&password=<IP Update Password>
```

제대로 붙었는지 확인:

```bash
getent hosts smagukji.freeddns.org     # 인스턴스 IP 가 나와야 한다
```

**이걸 먼저 맞춰야 한다.** 안 맞은 채로 인증서를 받으려 하면 실패하는데, Let's Encrypt 는
실패 횟수에 상한이 있어 모르고 반복하면 한 시간 넘게 묶인다. `init-letsencrypt.sh` 가
이걸 먼저 검사해서 안 맞으면 아예 시도하지 않는다.

> 오라클에서 **Reserved public IP** 로 잡아 두면 인스턴스를 껐다 켜도 IP 가 안 바뀐다.
> Always Free 에 포함된다. 그렇게 해 두면 DDNS 갱신은 보험일 뿐이다.


## 5) 배포

```bash
git clone <저장소> smagukji && cd smagukji/deploy/oracle
cp .env.example .env
vi .env                        # DOMAIN, CERT_EMAIL, DDNS_UPDATE_URL, SUPABASE_* 를 채운다

./init-letsencrypt.sh          # 최초 1회. 인증서를 처음 받는다
docker compose up -d --build   # 전체 기동
```

`init-letsencrypt.sh` 가 따로 필요한 이유가 있다. nginx 는 인증서 파일이 있어야 뜨는데,
인증서를 받으려면 nginx 가 떠서 챌린지에 응답해야 한다. 서로를 기다려서 그냥 올리면 둘 다
못 뜬다. 그래서 **임시 자체서명 인증서로 nginx 를 먼저 띄우고, 진짜 인증서를 받은 뒤 갈아
끼운다.**

> 처음에는 `.env` 에서 `STAGING=1` 주석을 풀고 연습용 인증서로 시험하는 편이 낫다.
> 진짜 서버는 같은 도메인에 **주당 5회**까지만 발급해 준다.

## 6) 확인

```bash
curl -I https://your-domain.com/actuator/health   # 200
docker compose ps                                  # 네 컨테이너 모두 Up
docker compose logs -f api
```

## 구조 — 프론트와 백엔드가 어떻게 붙는가

```
인터넷 ──443──▶ web (nginx)  ─┬─▶ /            정적 파일을 직접 준다
                              └─▶ /api/*       api 로 넘긴다
                 api (Spring) ─────▶ Supabase (DB · 인터넷 너머)
```

**프론트와 API 가 같은 도메인**이라 브라우저에게는 같은 오리진이다. CORS 를 아예 타지 않으므로
`CORS_ALLOWED_ORIGINS` 는 **비워 두는 것이 정상**이다.

**정적 파일은 nginx 가 직접 준다.** 자바를 거치지 않는다. 이유가 둘이다 — 카드 이미지 160장과
판독기 부품 14MB 를 자바가 흘려보낼 이유가 없고, **백엔드를 재시작해도 화면은 살아 있다.**

DB 는 Supabase 그대로다. 오라클에는 DB 를 두지 않는다. 로그인·조회·RLS 가 이미 Supabase 에
붙어 있어 옮길 이유가 없다.

## 파일 구성

| 파일 | 하는 일 |
|---|---|
| `docker-compose.yml` | api · web · certbot · ddns 네 컨테이너 |
| `Dockerfile.web` | 프론트 빌드 → nginx 이미지 |
| `nginx/app.conf.template` | SSL 종단, 정적 서빙, API 프록시 |
| `init-letsencrypt.sh` | 최초 인증서 발급 |
| `.env.example` | 채워야 할 값 목록 |

루트 `Dockerfile` 은 **타깃 두 개**를 갖는다.

```bash
docker build -t smagukji .                    # allinone — 프론트를 JAR 안에 넣은 한 덩어리
docker build --target api -t smagukji-api .   # api      — 백엔드만
```

Render·Northflank 처럼 «컨테이너 하나» 만 받는 곳에서는 `allinone` 이 필요하고, 여기서는
`api` 를 쓴다. `--target api` 로 빌드하면 BuildKit 이 **프론트 빌드 단계를 아예 건너뛰어**
백엔드만 고칠 때 npm 빌드를 기다리지 않아도 된다.

### 설계에서 일부러 그렇게 한 것

**api 는 호스트 포트를 열지 않는다.** `ports` 가 아니라 `expose` 다. 8080 을 인터넷에 직접
노출하면 nginx 를 우회해 **평문으로** 접속할 수 있게 된다. 바깥을 향하는 것은 web 뿐이다.

**nginx 가 6시간마다 스스로 reload 한다.** certbot 이 인증서를 갱신해도 nginx 는 알아서 다시
읽지 않는다. 이게 없으면 «갱신은 됐는데 만료된 인증서를 계속 내주는» 상태가 된다.

**`NGINX_ENVSUBST_FILTER=DOMAIN` 을 반드시 함께 준다.** nginx 이미지가 템플릿을 envsubst 로
처리하는데, 필터가 없으면 `$host`·`$remote_addr` 같은 **nginx 변수까지 빈 문자열로 바꿔**
설정이 통째로 망가진다.

**정적 파일은 이미지에 굽고 설정은 마운트한다.** 정적 파일을 볼륨으로 넘기면 지금 떠 있는
nginx 가 어느 빌드의 파일을 들고 있는지 알 수 없다. 반대로 nginx 설정은 도메인마다 달라지므로
이미지에 넣으면 도메인을 바꿀 때마다 다시 빌드해야 한다.

**`client_max_body_size 20m`** — 기본값 1MB 로는 전보 사진과 인사 xlsx 가 막힌다.

**`proxy_read_timeout 300s`** — 시트 파싱은 오래 걸린다. 기본 60초로는 끊긴다.

**`X-Forwarded-Proto`** — 이게 없으면 Spring 이 자기를 http 로 알고 리다이렉트를 http 로 만든다.

**SPA 폴백보다 정적 파일을 먼저 본다.** `/cards/...` 같은 경로가 `index.html` 로 떨어지지
않도록 정적 규칙을 위에 두었다.


---

# B. Northflank

## 절차

1. Northflank → **Create Service → Build & Deploy from Git**
2. 저장소를 연결하고 **Dockerfile** 을 고른다 (루트의 `Dockerfile` 그대로 쓴다)
3. **Build arguments** 에 넣는다 — Vite 는 이 값을 빌드 시점에 번들에 새긴다.
   런타임 환경변수로는 바뀌지 않으므로 반드시 «빌드» 쪽에 넣어야 한다.
   ```
   VITE_SUPABASE_URL       https://<프로젝트ref>.supabase.co
   VITE_SUPABASE_ANON_KEY  <anon public 키>
   VITE_API_BASE_URL       (비워 둔다)
   ```
4. **Runtime environment** 에 넣는다:
   ```
   SPRING_PROFILES_ACTIVE  prod
   SUPABASE_URL            https://<프로젝트ref>.supabase.co
   SUPABASE_DB_URL         jdbc:postgresql://...pooler.supabase.com:5432/postgres?sslmode=require
   SUPABASE_DB_USER        postgres.<프로젝트ref>
   SUPABASE_DB_PASSWORD    <비밀번호>
   DB_POOL_MAX_SIZE        5
   DB_POOL_MIN_IDLE        1
   JPA_DDL_AUTO            none
   ASSET_IMPORT_ON_STARTUP false
   APP_MIN_PASSWORD_LENGTH 8
   GENERAL_SHEET_CSV_URL   ...
   ROSTER_SHEET_CSV_URL    ...
   TACTIC_SHEET_CSV_URL    ...
   BUFF_SHEET_CSV_URL      ...
   ```
5. Port **8080** 을 public 으로 열면 SSL 이 붙은 하위 도메인을 준다
6. Health check: `/actuator/health`

`CORS_ALLOWED_ORIGINS` 는 **비워 둔다.** 프론트가 JAR 안에 들어 있어 같은 오리진이다.

## 주의

**첫 빌드가 오래 걸린다.** 프론트 빌드 + Gradle 빌드를 한 이미지에서 하므로 10분 안팎이다.
메모리가 모자라 빌드가 죽으면 빌드 리소스를 올려야 한다.

---

# 옮긴 뒤 반드시 할 것

**Supabase 의 `CORS_ALLOWED_ORIGINS` 와 무관하게**, 새 주소를 아는 곳이 몇 군데 있다.

1. `frontend/.env.local` (로컬 개발용) 은 그대로 둔다 — 로컬은 vite 프록시를 쓴다
2. Render 서비스는 **바로 지우지 말고** 새 주소가 며칠 잘 도는지 본 뒤 정리한다
3. 동맹원에게 새 주소를 알린다

---

# 부록 — 인사 시트 업로드 401 의 원인

옮기기 전에 발견한 것이라 남겨 둔다.

`frontend/src/api/client.ts` 가 이랬다:

```ts
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
```

`.env.example` 은 «비워두면 같은 오리진의 `/api` 로 간다» 고 적어 두었는데, **`??` 는 빈
문자열을 «값이 있는 것» 으로 친다.** 그래서 `VITE_API_BASE_URL=` 로 두면 `API_BASE` 가
빈 문자열이 되고, 요청이 `/api` 를 건너뛴 `/hr/members/import` 로 나간다. vite 프록시는
`/api` 만 넘기므로 이 요청은 백엔드에 닿지도 못한다.

`||` 로 고쳤다. 문서가 말하는 동작과 코드가 어긋나 있었다.

> 다만 이것만으로 401 이 설명되지는 않는다. Render 쪽 `SUPABASE_URL` 은 정상이었고 토큰
> 검증 설정도 로그에 정상으로 찍혔다. 새 서버로 옮긴 뒤에도 401 이 남으면 그때는
> **Supabase 의 JWT 서명 키**를 봐야 한다 — 프로젝트가 아직 레거시 HS256 비밀키로 사용자
> 토큰을 서명하고 있으면, JWKS(ES256) 로 검증하는 백엔드가 토큰을 거절한다.
> Supabase → Project Settings → JWT Keys 에서 비대칭 키가 «current» 인지 확인한다.
