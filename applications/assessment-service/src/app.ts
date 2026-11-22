import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAdminRoute } from "./assessments/admin.route";
import { createAssessmentRoute } from "./assessments/assessment.route";
import { forkEm } from "./db/orm";
import { loadEnvConfig, type EnvConfig } from "./shared/env";
import { handleAppError } from "./shared/errors";
import { createGroupAccessClient, type GroupAccessClient } from "./shared/group-access";
import { attachEntityManager, requireInternalSecret } from "./shared/middleware";
import type { AppEnv } from "./shared/types";
import { createS3AssessmentStorage, type AssessmentStorage } from "./storage/s3.storage";

export interface AppDependencies {
    env?: EnvConfig;
    forkEntityManager?: () => EntityManager;
    groupAccess?: GroupAccessClient;
    storage?: AssessmentStorage;
}

export function createApp(dependencies: AppDependencies = {}): Hono<AppEnv> {
    const env: EnvConfig = dependencies.env ?? loadEnvConfig();
    const forkEntityManager: () => EntityManager = dependencies.forkEntityManager ?? forkEm;
    const groupAccess: GroupAccessClient =
        dependencies.groupAccess ?? createGroupAccessClient(env);
    const storage: AssessmentStorage =
        dependencies.storage ?? createS3AssessmentStorage(env);

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

    app.get(
        "/health",
        (c): Response => c.json({ status: "ok", service: "assessment-service" }, 200)
    );

    app.use("/api/v1/internal/*", requireInternalSecret(env.internalServiceSecret));
    app.use("/api/v1/internal/*", attachEntityManager(forkEntityManager));
    app.route("/api/v1/internal/assessments", createAssessmentRoute(env, groupAccess, storage));
    app.route("/api/v1/internal/admin/assessments", createAdminRoute());

    app.notFound(
        (c): Response => c.json({ error_code: "NOT_FOUND", message: "Route not found." }, 404)
    );

    return app;
}
