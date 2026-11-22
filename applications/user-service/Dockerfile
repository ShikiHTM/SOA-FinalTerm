FROM node:24-bookworm-slim AS builder

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY applications/user-service applications/user-service
RUN pnpm --filter @soa-final-term/user-service install --frozen-lockfile
RUN pnpm --filter @soa-final-term/user-service build

FROM node:24-bookworm-slim AS runner

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY applications/user-service/package.json applications/user-service/package.json
RUN pnpm --filter @soa-final-term/user-service install --prod --frozen-lockfile
COPY --from=builder /workspace/dist/applications/user-service applications/user-service/dist

WORKDIR /workspace/applications/user-service
EXPOSE 3031
CMD ["node", "dist/main.js"]
