FROM node:24-bookworm-slim AS base

WORKDIR /workspace
RUN npm install -g pnpm@10.18.0

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY applications/assessment-service applications/assessment-service
RUN pnpm --filter @soa-final-term/assessment-service install --frozen-lockfile
RUN pnpm --filter @soa-final-term/assessment-service build

FROM base AS runner

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY applications/assessment-service/package.json applications/assessment-service/package.json
RUN pnpm --filter @soa-final-term/assessment-service install --prod --frozen-lockfile
COPY --from=builder /workspace/dist/applications/assessment-service applications/assessment-service/dist

WORKDIR /workspace/applications/assessment-service
EXPOSE 8003
CMD ["node", "dist/main.js"]
