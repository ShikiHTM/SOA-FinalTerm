import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAdminRoute } from "./contests/admin.route";
import { createContestRoute } from "./contests/contest.route";
import { forkEm } from "./db/orm";
import { createServiceClients, type ServiceClients } from "./shared/clients";
import { loadEnvConfig, type EnvConfig } from "./shared/env";
import { handleAppError } from "./shared/errors";
import { attachEntityManager, requireInternalSecret } from "./shared/middleware";
import type { AppEnv } from "./shared/types";

export interface AppDependencies {
    env?: EnvConfig;
    forkEntityManager?: () => EntityManager;
    clients?: ServiceClients;
}

export function createApp(dependencies: AppDependencies = {}): Hono<AppEnv> {
    const env: EnvConfig = dependencies.env ?? loadEnvConfig();
    const forkEntityManager: () => EntityManager = dependencies.forkEntityManager ?? forkEm;
    const clients: ServiceClients = dependencies.clients ?? createServiceClients(env);

    const app = new Hono<AppEnv>();
    app.onError(handleAppError);

    const allowedOrigin: string | string[] = env.corsAllowedOrigins.includes("*")
        ? "*"
        : env.corsAllowedOrigins;

    app.use(
        "*",
        cors({
            origin: allowedOrigin,
            allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allowHeaders: [
                "Content-Type",
                "Authorization",
                "X-Internal-Secret",
                "X-User-Id",
                "X-User-Role"
            ],
            maxAge: 600
        })
    );

    app.get(
        "/health",
        (c): Response => c.json({ status: "ok", service: "contest-service" }, 200)
    );

    app.use("/api/v1/internal/*", requireInternalSecret(env.internalServiceSecret));
    app.use("/api/v1/internal/*", attachEntityManager(forkEntityManager));
    app.route("/api/v1/internal/contests", createContestRoute(clients));
    app.route("/api/v1/internal/admin/contests", createAdminRoute());

    app.notFound(
        (c): Response => c.json({ error_code: "NOT_FOUND", message: "Route not found." }, 404)
    );

    return app;
}
