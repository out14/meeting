# API 서버 이미지 (빌드 컨텍스트: 저장소 루트)
FROM node:22-alpine
WORKDIR /app

# 모노레포(yarn workspaces) 라 루트 lockfile 기준으로 운영 의존성만 설치한다
COPY package.json yarn.lock ./
COPY server/package.json server/
COPY client/package.json client/
RUN yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

COPY server/ server/
WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 4000
# 컨테이너가 뜰 때마다 DB 마이그레이션(여러 번 실행해도 안전) 후 서버 실행
CMD ["sh", "-c", "node db/init.js && node server.js"]
