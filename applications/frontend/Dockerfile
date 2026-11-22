FROM node:24-bookworm-slim AS builder

WORKDIR /workspace
RUN npm install -g pnpm@10.18.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY applications/frontend/package.json applications/frontend/package.json
RUN pnpm --filter @soa-final-term/frontend install --frozen-lockfile

COPY applications/frontend/index.html applications/frontend/index.html
COPY applications/frontend/tsconfig.json applications/frontend/tsconfig.json
COPY applications/frontend/vite.config.ts applications/frontend/vite.config.ts
COPY applications/frontend/public applications/frontend/public
COPY applications/frontend/src applications/frontend/src

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_GITHUB_CLIENT_ID=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_GITHUB_CLIENT_ID=$VITE_GITHUB_CLIENT_ID

RUN pnpm --filter @soa-final-term/frontend build

FROM nginx:1.27-alpine AS runner

ENV NGINX_ENVSUBST_FILTER=^VITE_
ENV VITE_API_BASE_URL=/api/v1
ENV VITE_GOOGLE_CLIENT_ID=
ENV VITE_GITHUB_CLIENT_ID=

COPY applications/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /workspace/applications/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
