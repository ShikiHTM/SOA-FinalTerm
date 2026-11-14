FROM node:24-bookworm-slim

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY applications/notification-service/package.json applications/notification-service/package.json
RUN pnpm --filter @soa-final-term/notification-service install --prod --frozen-lockfile
COPY applications/notification-service/src applications/notification-service/src
COPY applications/notification-service/migrations applications/notification-service/migrations
WORKDIR /workspace/applications/notification-service
EXPOSE 3037
CMD ["node", "src/index.ts"]
