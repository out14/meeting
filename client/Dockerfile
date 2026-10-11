# 화면 이미지: 빌드한 정적 파일을 Nginx 로 서빙하고 /api 는 server 컨테이너로 넘긴다 (빌드 컨텍스트: 저장소 루트)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
COPY client/package.json client/
COPY server/package.json server/
RUN yarn install --frozen-lockfile --ignore-scripts
COPY client/ client/
RUN yarn workspace client build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
