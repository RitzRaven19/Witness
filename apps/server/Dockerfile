# Witness ingestion server image.
#
# Two-stage build:
#   1. "build" — full pnpm workspace, builds crypto-core -> lora-dtn -> server,
#      then uses `pnpm deploy --legacy` to produce a self-contained directory
#      (package.json + built dist/ + only the production node_modules this
#      one package needs — no dev deps, no sibling apps/packages).
#   2. runtime — just that deployed directory on a slim Node base, running as
#      a non-root user.
#
# Build from the MONOREPO ROOT (context must include packages/ and apps/):
#   docker build -f apps/server/Dockerfile -t witness-server .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Install deps first for better layer caching — copy only the manifests plus
# the source needed to resolve the workspace (pnpm needs each package.json).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/crypto-core/package.json packages/crypto-core/package.json
COPY packages/lora-dtn/package.json packages/lora-dtn/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile --filter "@witness/server..."

# Now bring in the actual source and build.
COPY packages/crypto-core packages/crypto-core
COPY packages/lora-dtn packages/lora-dtn
COPY apps/server apps/server
RUN pnpm --filter "@witness/server..." run build

# Produce a self-contained, production-only deploy directory.
RUN pnpm --filter @witness/server deploy --prod --legacy /out

# ── Runtime ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S witness && adduser -S witness -G witness
COPY --from=build --chown=witness:witness /out ./

# Evidence blobs, manifests, and receipts live here — mount a volume in
# production so data survives container restarts/upgrades.
RUN mkdir -p /app/data && chown witness:witness /app/data
VOLUME ["/app/data"]
ENV DATA_DIR=/app/data

USER witness
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
