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

# Create a writable data directory for SQLite (Render runs the container
# as a non-root user, so make /data world-writable for compatibility).
# Mount a Render persistent disk at /data for durable storage across restarts.
RUN mkdir -p /data && chmod 1777 /data

# Default the database to the writable /data directory.
# Override with T3SPEND_DB_PATH env var for custom paths or persistent disks.
ENV T3SPEND_DB_PATH=/data/t3spend.sqlite

# Render sets PORT automatically; fallback to 10000
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || '10000') + '/health').then(r => {if(!r.ok)throw new Error}).catch(() => process.exit(1))"

USER bun

ENTRYPOINT ["bun", "run", "--cwd", "packages/server", "start"]
