# ---- Builder ----
FROM node:22-alpine AS builder
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

RUN pnpm deploy --filter @dictate/worker /tmp/deps

# ---- Runner ----
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init bash
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /tmp/deps /app

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "--no-install", "tsx", "src/index.ts"]