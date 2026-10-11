#!/usr/bin/env bash
# 새 버전 배포: 저장소 루트에서 `bash deploy/update.sh`
# 최신 코드 받기 → 이미지 다시 빌드 → 컨테이너 교체 (DB 마이그레이션은 server 컨테이너가 뜰 때 자동)
set -euo pipefail
cd "$(dirname "$0")/.."

echo '▶ 최신 코드 받기'
git pull --ff-only

echo '▶ 빌드 & 재시작'
docker compose up -d --build

echo '▶ 안 쓰는 이전 이미지 정리'
docker image prune -f

docker compose ps
echo '✔ 배포 완료'
