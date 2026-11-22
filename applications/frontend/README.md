# LMS Frontend

Web client for the Learning Management System Assessment and Grading Platform.

## Prerequisites

- Node.js 22+
- pnpm 10+
- Running API Gateway (default `http://localhost:3000`, or run the full stack via Docker Compose)

## Environment Variables

Configure optional overrides in `applications/frontend/.env.local` (based on [applications/frontend/.env.example](.env.example)):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | API base path used by browser requests |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Upstream API Gateway target for Vite dev/preview `/api` proxy |
| `VITE_GOOGLE_CLIENT_ID` | _(empty)_ | Google OAuth2 Web Client ID (optional) |
| `VITE_GITHUB_CLIENT_ID` | _(empty)_ | GitHub OAuth App Client ID (optional) |

> Never place OAuth client secrets or server credentials in frontend environment variables. All `VITE_*` values are embedded into client assets.

### OAuth2 Redirect URIs

If enabling social sign-in, register these callback URLs with your OAuth providers:

- **Google**: `http://localhost:5173/auth/callback/google`
- **GitHub**: `http://localhost:5173/auth/callback/github`

## Run Locally

1. Install workspace dependencies from the repository root:

```powershell
pnpm install --frozen-lockfile
```

2. (Optional) Create `applications/frontend/.env.local` if overriding defaults:

```powershell
Copy-Item applications/frontend/.env.example applications/frontend/.env.local
```

3. Start the frontend development server:

```powershell
pnpm --filter @soa-final-term/frontend dev
```

Open `http://localhost:5173`. Requests to `/api/*` are proxied automatically to `VITE_API_PROXY_TARGET` (`http://localhost:3000` by default).

## Run with Docker Compose

Start the API Gateway, backend services, and frontend together from the repository root:

```powershell
docker compose up -d --build frontend
```

Open `http://localhost:5173` (or override the host port with `FRONTEND_PORT`).

## Available Commands

Run from the repository root:

```powershell
pnpm --filter @soa-final-term/frontend dev
pnpm --filter @soa-final-term/frontend build
pnpm --filter @soa-final-term/frontend preview
pnpm --filter @soa-final-term/frontend lint
pnpm --filter @soa-final-term/frontend typecheck
pnpm --filter @soa-final-term/frontend test
```
