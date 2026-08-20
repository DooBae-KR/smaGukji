#!/usr/bin/env bash
# 로컬 Docker 로 실행한다.
#
#   ./docker-run.sh          이미지를 빌드해서 실행
#   ./docker-run.sh --pull   GHCR 에 CI 가 올려둔 이미지를 받아서 실행 (빌드 생략, 빠름)
#
# 비밀값은 이미지에 굽지 않는다. .env 를 런타임에 주입한다.
set -euo pipefail

cd "$(dirname "$0")"

IMAGE="smagukji:local"
REMOTE="ghcr.io/doobae-kr/smagukji:latest"
NAME="smagukji"
PORT="${PORT:-8080}"

if [ ! -f .env ]; then
  echo "❌ .env 가 없습니다. .env.example 을 복사해 값을 채우세요." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker 데몬이 실행 중이 아닙니다." >&2
  echo "   Docker Desktop 을 켜세요. WSL 기능을 방금 켰다면 재부팅이 먼저 필요합니다." >&2
  exit 1
fi

if [ "${1:-}" = "--pull" ]; then
  echo "▶ GHCR 이미지 받는 중: $REMOTE"
  docker pull "$REMOTE"
  IMAGE="$REMOTE"
else
  echo "▶ 이미지 빌드 중 (몇 분 걸립니다)"
  docker build -t "$IMAGE" .
fi

# 이전 컨테이너가 있으면 치운다.
docker rm -f "$NAME" >/dev/null 2>&1 || true

echo "▶ 컨테이너 실행"
docker run -d --name "$NAME" \
  -p "${PORT}:8080" \
  --env-file .env \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e APP_MIN_PASSWORD_LENGTH=8 \
  -e DB_POOL_MAX_SIZE=3 \
  --restart unless-stopped \
  "$IMAGE"

echo "▶ 기동 대기 중…"
for i in $(seq 1 60); do
  if curl -fsS "http://localhost:${PORT}/actuator/health" >/dev/null 2>&1; then
    echo "✅ 준비 완료 → http://localhost:${PORT}"
    exit 0
  fi
  sleep 2
done

echo "❌ 기동 확인에 실패했습니다. 로그를 확인하세요:" >&2
echo "   docker logs $NAME" >&2
exit 1
