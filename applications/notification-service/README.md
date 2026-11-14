# Notification Service

TypeScript in-app notification service with PostgreSQL, parameterized SQL, REST and a Kafka consumer.

## Run using Docker Compose

From the repository root, set `INTERNAL_SERVICE_SECRET` in your environment or root `.env`, then run:

```powershell
$env:INTERNAL_SERVICE_SECRET = "local-dev-secret"
docker compose up -d --build notification_service swagger_ui
```

Compose starts Notification Service and its PostgreSQL database; it does not create a Kafka broker. The API is available at `http://localhost:3037/api/v1`, and Swagger UI at `http://localhost:8080`. Choose **Notification Service** in Swagger UI. PostgreSQL uses the `notification_data` volume and is reachable by other containers on the Compose network at `notification_pgsql_db:5432`; its port is not published on the host. To inspect it from the host, use `docker compose exec notification_pgsql_db psql -U notification -d notification_db`. Database credentials default to local development values and can be overridden using `NOTIFICATION_DB_USER`, `NOTIFICATION_DB_PASSWORD` and `NOTIFICATION_DB_NAME`.

The service applies the idempotent baseline SQL in `migrations/001_initial.sql` at startup. This baseline creates missing objects; future schema changes require explicit new migrations. The previous `data/notifications.json` is not deleted or imported. Back it up and migrate it separately if it contains data that must be kept.

Database access uses the `pg` driver. SQL statements for inserting, listing and marking notifications as read live in `src/repositories/notification.repository.ts`. Values are passed as query parameters rather than inserted into SQL text.

## Run locally

Requires Node.js 22.18 or newer. Running Node on the host requires a separate PostgreSQL instance reachable from the host: the Compose database has no published host port. With pnpm dependencies installed and PostgreSQL available, set the variables shown in `.env.example`. `NOTIFICATION_DATABASE_URL`, if set, overrides individual `NOTIFICATION_DB_*` connection fields. Kafka is disabled by default. To use the team's shared broker, set `KAFKA_ENABLED=true` and `KAFKA_BROKERS` to broker addresses reachable from the service container, and agree on the topic with the team. When Kafka is enabled, startup fails if broker addresses are missing or the connection cannot be established.

```powershell
cd applications/notification-service
$env:INTERNAL_SERVICE_SECRET = "local-dev-secret"
node src/index.ts
```

## Interfaces

See [docs/openapi.yaml](docs/openapi.yaml) for REST and [docs/kafka-event.md](docs/kafka-event.md) for the proposed Kafka event. The topic and payload must be agreed with producers before integration. The API Gateway must authenticate users, remove any client-provided `X-User-Id`, and forward the verified ID. The API trusts this header, so it must be reachable only through a trusted gateway or network. Internal callers use `X-Internal-Secret`; do not expose that secret publicly.

`CORS_ALLOWED_ORIGINS` defaults to `http://localhost:8080` and accepts comma-separated origins. CORS does not replace authentication. `/health` is a process liveness check; startup requires PostgreSQL and, when enabled, Kafka.

Compose publishes the Notification API port on the host interfaces. Since the API trusts `X-User-Id`, restrict network access to trusted callers and place it behind an authenticated gateway before sharing the deployment.

For manual Postman testing, import `docs/openapi.yaml`, select `http://localhost:3037/api/v1`, create a notification with `X-Internal-Secret`, list it using `X-User-Id`, and mark it as read. The Kafka guide contains a sample producer command.

Run `pnpm nx run-many -t lint typecheck test build -p notification-service` from the repository root for the team's checks. The build compiles TypeScript to `dist/applications/notification-service` and includes its SQL baseline and package manifest; standalone execution from that directory requires its runtime dependencies to be installed. The Nx build does not build a Docker image. These checks do not replace testing against the actual Compose services.
