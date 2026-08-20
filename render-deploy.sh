#!/usr/bin/env bash
# Render 에 배포한다. 브라우저 없이 REST API 로만 처리한다.
#
# 사전 준비 (한 번만)
#   1. https://render.com 가입 (GitHub 계정으로 하면 빠름)
#   2. Account Settings → API Keys → Create API Key
#   3. .env 에 한 줄 추가:  RENDER_API_KEY=rnd_xxxxxxxx
#
# 실행
#   ./render-deploy.sh
#
# 저장소가 public 이라 GitHub App 연동 없이 git URL 만으로 배포된다.
set -euo pipefail
cd "$(dirname "$0")"

API="https://api.render.com/v1"
REPO="https://github.com/DooBae-KR/smaGukji"
NAME="${RENDER_SERVICE_NAME:-smagukji}"
REGION="${RENDER_REGION:-singapore}"   # Supabase 가 뭄바이라 싱가포르가 가장 가깝다
BRANCH="main"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ $1 이 필요합니다." >&2; exit 1; }; }
need curl
need node

[ -f .env ] || { echo "❌ .env 가 없습니다." >&2; exit 1; }

val() { grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- || true; }

KEY="${RENDER_API_KEY:-$(val RENDER_API_KEY)}"
if [ -z "$KEY" ]; then
  cat >&2 <<'MSG'
❌ RENDER_API_KEY 가 없습니다.

  1. https://render.com 가입
  2. 우측 상단 프로필 → Account Settings → API Keys → Create API Key
  3. .env 에 추가:  RENDER_API_KEY=rnd_xxxxxxxx

  키는 .env 에만 두세요. .env 는 git 에 올라가지 않습니다.
MSG
  exit 1
fi

DB_URL="$(val SUPABASE_DB_URL)"
DB_USER="$(val SUPABASE_DB_USER)"
DB_PASS="$(val SUPABASE_DB_PASSWORD)"
for v in DB_URL DB_USER DB_PASS; do
  [ -n "${!v}" ] || { echo "❌ .env 에 SUPABASE_* 값이 비어 있습니다 ($v)" >&2; exit 1; }
done

# 시트 URL. 없어도 배포는 되지만 «데이터» 탭의 불러오기 버튼이 거부한다.
GENERAL_SHEET="$(val GENERAL_SHEET_CSV_URL)"
ROSTER_SHEET="$(val ROSTER_SHEET_CSV_URL)"
if [ -z "$GENERAL_SHEET" ] || [ -z "$ROSTER_SHEET" ]; then
  echo "⚠️  .env 에 시트 URL 이 없습니다. 배포는 진행하지만 시트 불러오기 버튼은 동작하지 않습니다."
  echo "    GENERAL_SHEET_CSV_URL / ROSTER_SHEET_CSV_URL"
fi

# 로그인 검증에 쓰는 Supabase 주소. 없으면 토큰을 확인할 수 없어 /api 가 전부 잠긴다.
SUPABASE_URL_VAL="$(val SUPABASE_URL)"
[ -n "$SUPABASE_URL_VAL" ] || { echo "❌ .env 에 SUPABASE_URL 이 없습니다. 없으면 API 가 전부 401 이 됩니다." >&2; exit 1; }

# 프론트가 Netlify 로 분리돼 다른 오리진이 됐다. 그 주소를 허용하지 않으면
# 브라우저가 모든 요청을 막아 «아무것도 안 되는» 것처럼 보인다.
CORS_VAL="$(val CORS_ALLOWED_ORIGINS)"
if [ -z "$CORS_VAL" ] || [ "$CORS_VAL" = "http://localhost:5173" ]; then
  echo "⚠️  CORS_ALLOWED_ORIGINS 가 로컬 주소뿐입니다."
  echo "    Netlify 주소를 .env 에 추가하세요. 예)"
  echo "    CORS_ALLOWED_ORIGINS=http://localhost:5173,https://smagukji.netlify.app"
fi

api() { # api METHOD PATH [BODY]
  local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -sS -X "$m" "$API$p" \
      -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$b"
  else
    curl -sS -X "$m" "$API$p" \
      -H "Authorization: Bearer $KEY" \
      -H "Accept: application/json"
  fi
}

echo "▶ 계정 확인"
OWNER=$(api GET "/owners?limit=1" | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    let j; try{j=JSON.parse(s)}catch(e){console.error('  응답 파싱 실패: '+s.slice(0,200));process.exit(1)}
    if(j.message){console.error('  API 오류: '+j.message);process.exit(1)}
    const o=Array.isArray(j)?j[0]:null;
    if(!o||!o.owner){console.error('  소유자를 찾지 못했습니다: '+s.slice(0,200));process.exit(1)}
    console.log(o.owner.id);
  })")
echo "  ownerId=$OWNER"

echo "▶ 기존 서비스 확인"
EXISTING=$(api GET "/services?name=$NAME&limit=1" | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    let j; try{j=JSON.parse(s)}catch(e){console.log('');return}
    const a=Array.isArray(j)?j:[];
    console.log(a.length&&a[0].service?a[0].service.id:'');
  })")

# 환경변수는 서비스 생성/갱신 시 함께 넣는다. 비밀값은 Render 쪽에 저장된다.
#
# ⚠️ node 에 값을 넘길 때는 반드시 «접두사» 형태(VAR=x node -e ...)를 써야 한다.
#    node -e "..." VAR=x 는 환경변수가 아니라 argv 로 들어가서 process.env 가 비어버린다.
ENVVARS=$(DB_URL="$DB_URL" DB_USER="$DB_USER" DB_PASS="$DB_PASS" \
  GENERAL_SHEET="$GENERAL_SHEET" ROSTER_SHEET="$ROSTER_SHEET" \
  SUPABASE_URL_VAL="$SUPABASE_URL_VAL" CORS_VAL="$CORS_VAL" node -e "
  const e=[
    ['SPRING_PROFILES_ACTIVE','prod'],
    ['SUPABASE_DB_URL',process.env.DB_URL],
    ['SUPABASE_DB_USER',process.env.DB_USER],
    ['SUPABASE_DB_PASSWORD',process.env.DB_PASS],
    ['APP_MIN_PASSWORD_LENGTH','8'],
    ['DB_POOL_MAX_SIZE','3'],
    ['DB_POOL_MIN_IDLE','1'],
    ['JPA_DDL_AUTO','none'],
    ['ASSET_IMPORT_ON_STARTUP','false'],
    ['ASSET_SOURCE_DIR',''],
    // 로그인 토큰(Supabase 발급)을 검증할 주소. 없으면 /api 가 전부 잠긴다.
    ['SUPABASE_URL',process.env.SUPABASE_URL_VAL||''],
    // Netlify 프론트는 다른 오리진이라 명시하지 않으면 브라우저가 막는다.
    ['CORS_ALLOWED_ORIGINS',process.env.CORS_VAL||''],
    // 데이터 탭의 시트 불러오기 버튼이 쓰는 값. 공개 시트라 비밀값이 아니다.
    ['GENERAL_SHEET_CSV_URL',process.env.GENERAL_SHEET||''],
    ['ROSTER_SHEET_CSV_URL',process.env.ROSTER_SHEET||''],
  ];
  for(const [k,v] of e) if(v===undefined) { console.error('값 누락: '+k); process.exit(1); }
  console.log(JSON.stringify(e.map(([key,value])=>({key,value:String(value)}))));
")

if [ -n "$EXISTING" ]; then
  echo "▶ 기존 서비스에 배포 트리거 ($EXISTING)"
  api PUT "/services/$EXISTING/env-vars" "$ENVVARS" > /dev/null
  DEPLOY=$(api POST "/services/$EXISTING/deploys" '{"clearCache":"do_not_clear"}')
  SERVICE_ID="$EXISTING"
else
  echo "▶ 서비스 생성"
  BODY=$(ENVVARS="$ENVVARS" NAME="$NAME" OWNER="$OWNER" REPO="$REPO" BRANCH="$BRANCH" REGION="$REGION" node -e "
    const envVars=JSON.parse(process.env.ENVVARS);
    console.log(JSON.stringify({
      type:'web_service',
      name:process.env.NAME,
      ownerId:process.env.OWNER,
      repo:process.env.REPO,
      branch:process.env.BRANCH,
      autoDeploy:'yes',
      envVars,
      serviceDetails:{
        env:'docker',
        plan:'free',
        region:process.env.REGION,
        healthCheckPath:'/actuator/health',
        envSpecificDetails:{ dockerfilePath:'./Dockerfile', dockerContext:'.' },
      },
    }));
  ")

  RESP=$(api POST "/services" "$BODY")
  SERVICE_ID=$(echo "$RESP" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      let j; try{j=JSON.parse(s)}catch(e){console.error('  응답 파싱 실패: '+s.slice(0,400));process.exit(1)}
      if(j.message){console.error('  생성 실패: '+j.message);process.exit(1)}
      const sv=j.service||j;
      if(!sv.id){console.error('  serviceId 없음: '+s.slice(0,400));process.exit(1)}
      console.log(sv.id);
    })")
fi

echo "  serviceId=$SERVICE_ID"

echo "▶ 빌드 대기 (몇 분 걸립니다)"
URL=""
for i in $(seq 1 90); do
  OUT=$(api GET "/services/$SERVICE_ID" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      let j; try{j=JSON.parse(s)}catch(e){console.log('unknown|');return}
      const sv=j.service||j;
      console.log((sv.suspended||'active')+'|'+(sv.serviceDetails&&sv.serviceDetails.url||''));
    })")
  URL="${OUT#*|}"
  D=$(api GET "/services/$SERVICE_ID/deploys?limit=1" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      let j; try{j=JSON.parse(s)}catch(e){console.log('?');return}
      const a=Array.isArray(j)?j:[];
      console.log(a.length&&a[0].deploy?a[0].deploy.status:'?');
    })")
  echo "  [$i] deploy=$D"
  case "$D" in
    live) echo "✅ 배포 완료 → ${URL:-(주소 확인 필요)}"; break ;;
    build_failed|update_failed|canceled|pre_deploy_failed)
      echo "❌ 배포 실패: $D" >&2
      echo "   Render 대시보드에서 로그를 확인하세요." >&2
      exit 1 ;;
  esac
  sleep 20
done

if [ -n "$URL" ]; then
  echo "▶ 동작 확인"
  curl -sS -o /dev/null -w "  %{http_code}  $URL/actuator/health\n" "$URL/actuator/health" || true
fi
