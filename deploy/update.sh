#!/usr/bin/env bash
# 새 버전 배포: 저장소 루트에서 `bash deploy/update.sh`
# 최신 코드 받기 → 패키지 설치 → 화면 빌드 → 화면 파일 교체 → DB 마이그레이션 → 서버 재시작
set -euo pipefail
cd "$(dirname "$0")/.."

echo '▶ 최신 코드 받기'
git pull --ff-only

echo '▶ 패키지 설치'
yarn install --frozen-lockfile

echo '▶ 화면 빌드'
yarn build

echo '▶ 화면 파일 교체 (/var/www/meeting)'
sudo mkdir -p /var/www/meeting
sudo rsync -a --delete client/dist/ /var/www/meeting/

echo '▶ DB 마이그레이션 (여러 번 실행해도 안전)'
yarn db:init

echo '▶ 서버 재시작'
pm2 reload deploy/ecosystem.config.cjs --update-env || pm2 start deploy/ecosystem.config.cjs
pm2 save

echo '✔ 배포 완료'
