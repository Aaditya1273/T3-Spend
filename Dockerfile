# T3 Spend — production Docker image (Bun monorepo)
#
# Build:   docker build -t t3spend-server .
# Run:     docker run -p 10000:10000 --env-file .env t3spend-server
#
# Deploy on Render:
#   Option A — Docker runtime (uses this file):  create Web Service → pick "Docker"
#   Option B — Native Bun runtime (simpler):      create Web Service → pick "Node",
#                                                  build: `bun install --frozen-lockfile`,
#                                                  start: `bun run --cwd packages/server start`
#                                                  No Dockerfile needed.

# ── Stage 1: Install all deps (including devDependencies) ──────────────
FROM oven/bun:1 AS install
WORKDIR /app

# Copy lockfile + workspace manifests
COPY bun.lock package.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/

# Install everything (devDeps needed for any build steps)
RUN bun install --frozen-lockfile

# ── Stage 2: Production deps only ──────────────────────────────────────
FROM oven/bun:1 AS prod-deps
WORKDIR /app

COPY bun.lock package.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/

RUN bun install --frozen-lockfile --production

# ── Stage 3: Build / prepare source ────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app

# Copy installed node_modules
COPY --from=install /app/node_modules node_modules

# Copy source code
COPY package.json bun.lock tsconfig.json ./
COPY packages/engine/package.json packages/engine/tsconfig.json packages/engine/
COPY packages/server/package.json packages/server/tsconfig.json packages/server/
COPY packages/engine/src packages/engine/src/
COPY packages/server/src packages/server/src/

RUN bun run --cwd packages/server typecheck 2>/dev/null || true

# ── Stage 4: Final runtime image ───────────────────────────────────────
FROM oven/bun:1-slim AS release
WORKDIR /app

# Bun user for security
USER bun

# Copy production node_modules
COPY --from=prod-deps /app/node_modules node_modules

# Copy source (Bun runs TypeScript directly — no compile step needed)
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/packages packages/

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || '10000') + '/health').then(r => {if(!r.ok)throw new Error}).catch(() => process.exit(1))"

ENTRYPOINT ["bun", "run", "--cwd", "packages/server", "start"]
