# syntax=docker/dockerfile:1
# Build context is the repository root (npm workspaces share one lockfile).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci --workspace backend --include-workspace-root

FROM deps AS build
COPY backend backend
RUN npm run build -w backend

# One-off migration runner: `docker compose run --rm migrate` (reviewed SQL, never db push).
FROM build AS migrate
ENV NODE_ENV=production
USER node
WORKDIR /app/backend
CMD ["npx", "prisma", "migrate", "deploy"]

FROM deps AS prod-deps
RUN npm prune --omit=dev --workspace backend --include-workspace-root

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --chown=node:node backend/package.json ./backend/package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/server.js"]
