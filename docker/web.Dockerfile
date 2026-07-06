# ---- Builder ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @dictate/web run build

# ---- Runner ----
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init wget
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

WORKDIR /app/apps/web
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]