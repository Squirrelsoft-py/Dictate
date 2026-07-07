# ---- Builder ----
FROM node:22-alpine AS builder
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm deploy --filter @dictate/api /tmp/deps

# ---- Runner ----
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init wget bash
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /tmp/deps /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /data && chown node:node /data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -q --tries=1 --spider http://localhost:3001/health || exit 1

USER node
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npx", "--no-install", "tsx", "src/index.ts"]