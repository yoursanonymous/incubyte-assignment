# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci --workspace frontend --include-workspace-root
COPY frontend frontend
RUN npm run build -w frontend

# Unprivileged nginx serves the SPA and reverse-proxies /api so browser and API share one origin
# (required for the SameSite=Strict refresh cookie).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
