# T3 Spend — production Docker image
# Single-stage build for a Bun monorepo.
#
# Deploy on Render:
#   Option A (this Dockerfile): New Web Service → Runtime: Docker
#   Option B (simpler):         New Web Service → Runtime: Node
#                                Build: bun install
#                                Start: bun run --cwd packages/server start
#                                No Dockerfile needed.

FROM oven/bun:1-slim

WORKDIR /app

# Copy the monorepo (node_modules excluded by .dockerignore)
COPY . .

# Install production dependencies
RUN bun install --production

# Ensure the data directory exists and is writable by the bun user
# (Set T3SPEND_DB_PATH=/data/t3spend.sqlite in Render env vars
#  and mount a persistent disk at /data for durable storage)
RUN mkdir -p /data && chown bun:bun /data

# Render sets PORT automatically; fallback to 10000
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || '10000') + '/health').then(r => {if(!r.ok)throw new Error}).catch(() => process.exit(1))"

USER bun

ENTRYPOINT ["bun", "run", "--cwd", "packages/server", "start"]
