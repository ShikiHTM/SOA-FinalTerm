import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { forkEm } from "./db/orm";
import { createAdminRoute } from "./groups/admin.route";
import { createGroupRoute } from "./groups/group.route";
import { loadEnvConfig, type EnvConfig } from "./shared/env";
import { handleAppError } from "./shared/errors";
import { attachEntityManager, requireInternalSecret } from "./shared/middleware";
import type { AppEnv } from "./shared/types";

export interface AppDependencies {
    env?: EnvConfig;
    forkEntityManager?: () => EntityManager;
}

export function createApp(dependencies: AppDependencies = {}): Hono<AppEnv> {
    const env: EnvConfig = dependencies.env ?? loadEnvConfig();
    const forkEntityManager: () => EntityManager = dependencies.forkEntityManager ?? forkEm;

    const app: Hono<AppEnv> = new Hono<AppEnv>();
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

    app.get("/health", (c): Response => c.json({ status: "ok", service: "group-service" }, 200));

    app.use("/api/v1/internal/*", requireInternalSecret(env.internalServiceSecret));
    app.use("/api/v1/internal/*", attachEntityManager(forkEntityManager));
    app.route("/api/v1/internal/groups", createGroupRoute());
    app.route("/api/v1/internal/admin/groups", createAdminRoute());

    app.notFound((c): Response => c.json({ error_code: "NOT_FOUND", message: "Route not found." }, 404));

    return app;
}
