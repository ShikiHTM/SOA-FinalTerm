FROM node:24-bookworm-slim AS base

WORKDIR /workspace
RUN npm install -g pnpm@10.18.0

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY applications/contest-service applications/contest-service
RUN pnpm --filter @soa-final-term/contest-service install --frozen-lockfile
RUN pnpm --filter @soa-final-term/contest-service build

FROM base AS runner

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY applications/contest-service/package.json applications/contest-service/package.json
RUN pnpm --filter @soa-final-term/contest-service install --prod --frozen-lockfile
COPY --from=builder /workspace/dist/applications/contest-service applications/contest-service/dist

WORKDIR /workspace/applications/contest-service
EXPOSE 8004
CMD ["node", "dist/main.js"]
