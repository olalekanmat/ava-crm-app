# Ava: web app + API server in one image. Data lives in /data (mount a persistent volume there).
FROM node:22-slim AS build
WORKDIR /app
ENV EXPO_OFFLINE=1 CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx expo export --platform web && npm run build:server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data WEB_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/server.mjs"]
