#!/usr/bin/env bash
#
# Let's Encrypt 인증서를 «처음» 발급받는다. 최초 1회만 실행한다.
# 그 뒤 갱신은 docker compose 의 certbot 컨테이너가 알아서 한다.
#
#   ./init-letsencrypt.sh
#
# 왜 따로 필요한가
#   nginx 는 인증서 파일이 있어야 뜨는데, 인증서를 받으려면 nginx 가 떠서 챌린지에
#   응답해야 한다. 서로를 기다리는 상태라 그냥 올리면 둘 다 못 뜬다. 그래서 임시
#   자체서명 인증서로 nginx 를 먼저 띄우고, 진짜 인증서를 받은 뒤 갈아 끼운다.

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ .env 가 없습니다. cp .env.example .env 후 값을 채워주세요."
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${DOMAIN:?DOMAIN 을 .env 에 넣어주세요 (예: smagukji.example.com)}"
: "${CERT_EMAIL:?CERT_EMAIL 을 .env 에 넣어주세요. 만료 안내를 받을 주소입니다}"

echo "도메인: $DOMAIN"

# 도메인이 이 서버를 가리키는지 먼저 확인한다. 안 맞으면 발급이 실패하는데,
# Let's Encrypt 는 실패 횟수에 상한이 있어 모르고 반복하면 한 시간 넘게 묶인다.
SERVER_IP=$(curl -fsS --max-time 10 https://api.ipify.org || echo '')
DOMAIN_IP=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || echo '')
if [ -n "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ] && [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  echo "⚠️  도메인이 이 서버를 가리키지 않습니다."
  echo "    이 서버: $SERVER_IP"
  echo "    $DOMAIN: $DOMAIN_IP"
  echo "    DNS A 레코드를 고치고 전파를 기다린 뒤 다시 실행하세요."
  exit 1
fi

mkdir -p certbot/conf certbot/www

LIVE="certbot/conf/live/$DOMAIN"
if [ ! -f "$LIVE/fullchain.pem" ]; then
  echo "임시 인증서를 만들어 nginx 를 먼저 띄웁니다…"
  mkdir -p "$LIVE"
  docker run --rm -v "$PWD/certbot/conf:/etc/letsencrypt" --entrypoint sh certbot/certbot \
    -c "openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
      -out    /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
      -subj '/CN=$DOMAIN'"
fi

# 프론트까지 함께 빌드된다. 첫 빌드는 10분 안팎 걸린다.
echo "web 컨테이너를 빌드해 띄웁니다… (첫 빌드는 오래 걸립니다)"
docker compose up -d --build web

echo "nginx 가 응답할 때까지 기다립니다…"
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost/.well-known/acme-challenge/test" || echo 000)
  [ "$code" != "000" ] && break
  sleep 2
done
if [ "$code" = "000" ]; then
  echo "❌ nginx 가 응답하지 않습니다. docker compose logs web 을 확인하세요."
  exit 1
fi

echo "임시 인증서를 지우고 진짜 인증서를 받습니다…"
docker compose run --rm --entrypoint sh certbot -c \
  "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf"

# STAGING=1 이면 연습용 서버에서 받는다. 설정을 시험할 때는 이걸 먼저 쓰는 편이 낫다 —
# 진짜 서버는 같은 도메인에 주당 5회까지만 발급해 준다.
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$CERT_EMAIL" \
  --agree-tos --no-eff-email \
  ${STAGING:+--staging} \
  -d "$DOMAIN"

echo "nginx 를 다시 읽습니다…"
docker compose exec web nginx -s reload

echo
echo "✅ 인증서 준비 완료."
echo "   이제  docker compose up -d --build  로 전체를 올리세요."
