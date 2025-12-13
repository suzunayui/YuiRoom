FROM node:24-alpine AS build

WORKDIR /app

COPY renderer/package.json renderer/package-lock.json ./renderer/
RUN cd renderer && npm ci

COPY renderer ./renderer

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
RUN cd renderer && npm run build

FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/renderer/dist /var/www/yuiroom/renderer/dist

