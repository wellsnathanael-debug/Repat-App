# Repatriation Documentation app + case repository server.
# Build:  docker build -t repat-app .
# Run:    see docker-compose.yml / docs/self-hosting.md

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Served at the container root, not under /Repat-App/ (that base is for GitHub Pages).
RUN BASE_PATH=/ npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data DIST_DIR=/app/dist PORT=8080
COPY --from=build /app/dist ./dist
COPY server/repo-server.mjs ./server/repo-server.mjs
VOLUME /data
EXPOSE 8080
# DESK_TOKEN must be provided at runtime; the server refuses to start without it.
CMD ["node", "server/repo-server.mjs"]
