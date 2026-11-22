FROM node:24-bookworm-slim AS base

WORKDIR /workspace
RUN npm install -g pnpm@10.18.0

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY applications/group-service applications/group-service
RUN pnpm --filter @soa-final-term/group-service install --frozen-lockfile
RUN pnpm --filter @soa-final-term/group-service build

FROM base AS runner

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY applications/group-service/package.json applications/group-service/package.json
RUN pnpm --filter @soa-final-term/group-service install --prod --frozen-lockfile
COPY --from=builder /workspace/dist/applications/group-service applications/group-service/dist

WORKDIR /workspace/applications/group-service
EXPOSE 8002
CMD ["node", "dist/main.js"]
