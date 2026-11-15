# Notification Service

TypeScript service for in-app notifications using PostgreSQL (`pg`), REST and an optional Kafka consumer.

## Run

From the repository root:

```powershell
$env:INTERNAL_SERVICE_SECRET = "local-dev-secret"
docker compose up -d --build notification_service swagger_ui
```

- API: `http://localhost:3037/api/v1`; within Compose: `http://notification_service:3037/api/v1`.
- Swagger: `http://localhost:8080` → **Notification Service**.
- PostgreSQL: `notification_pgsql_db:5432` within Compose; data persists in the `notification_data` volume.

## API

| Method | Path | Header |
| --- | --- | --- |
| `POST` | `/internal/notifications` | `X-Internal-Secret` |
| `GET` | `/notifications` | `X-User-Id` |
| `PATCH` | `/notifications/{notification_id}/read` | `X-User-Id` |
| `GET` | `/health` | — |

Paths use the `/api/v1` prefix. See [OpenAPI](docs/openapi.yaml) for schemas and query parameters. The gateway must authenticate the user and replace any client-provided `X-User-Id`; restrict direct access to trusted callers. REST create retries can produce duplicates.

## Configuration

- Set `INTERNAL_SERVICE_SECRET` to the shared internal secret; `local-dev-secret` is for local testing only.
- Kafka is disabled by default. Set `KAFKA_ENABLED=true` and `KAFKA_BROKERS` to use the team's broker. Topic: `KAFKA_NOTIFICATION_TOPIC` (default `notification.requested.v1`); agree on the [event contract](docs/kafka-event.md) with producers.
- See [.env.example](.env.example) for other settings. Compose reads the shell environment or the repository-root `.env`.
- [Initial SQL](migrations/001_initial.sql) runs at startup. Existing JSON prototype data is not imported automatically.

## Checks

```powershell
pnpm nx run-many -t lint typecheck test build -p notification-service
```

The Nx build outputs to `dist/applications/notification-service`; standalone execution requires runtime dependencies. It does not build a Docker image or test a real Kafka broker.
