# ---- Builder ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# ---- Runner ----
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/src ./apps/worker/src
COPY --from=builder /app/packages/shared ./packages/shared

WORKDIR /app/apps/worker
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "tsx", "src/index.ts"]