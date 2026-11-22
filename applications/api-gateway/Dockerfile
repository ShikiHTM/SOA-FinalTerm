FROM node:24-bookworm-slim AS base

WORKDIR /workspace
RUN npm install -g pnpm@10.18.0

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY applications/api-gateway applications/api-gateway
RUN pnpm --filter @soa-final-term/api-gateway install --frozen-lockfile
RUN pnpm --filter @soa-final-term/api-gateway build

FROM base AS runner

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY applications/api-gateway/package.json applications/api-gateway/package.json
RUN pnpm --filter @soa-final-term/api-gateway install --prod --frozen-lockfile
COPY --from=builder /workspace/dist/applications/api-gateway applications/api-gateway/dist

WORKDIR /workspace/applications/api-gateway
EXPOSE 3000
CMD ["node", "dist/main.js"]
