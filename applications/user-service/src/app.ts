import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuthRoute } from "./auth/auth.route";
import {
    createOAuthStrategies,
    type OAuthFetcher,
    type OAuthStrategy
} from "./auth/oauth.strategies";
import { createServiceRoute } from "./auth/service.route";
import { forkEm } from "./db/orm";
import { loadEnvConfig, type EnvConfig } from "./shared/env";
import { handleAppError } from "./shared/errors";
import { metricsHandler, metricsMiddleware } from "./shared/metrics";
import { attachEntityManager, requireInternalSecret } from "./shared/middleware";
import type { AppEnv, OAuthProvider } from "./shared/types";
import { createAdminRoute } from "./users/admin.route";
import { createUserRoute } from "./users/user.route";

export interface AppDependencies {
    env?: EnvConfig;
    forkEntityManager?: () => EntityManager;
    oauthFetcher?: OAuthFetcher;
}

export function createApp(dependencies: AppDependencies = {}): Hono<AppEnv> {
    const env: EnvConfig = dependencies.env ?? loadEnvConfig();
    const forkEntityManager: () => EntityManager = dependencies.forkEntityManager ?? forkEm;
    const oauthStrategies: Record<OAuthProvider, OAuthStrategy> = createOAuthStrategies(
        env,
        dependencies.oauthFetcher
    );

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

    app.use("*", metricsMiddleware());

    app.get("/health", (c): Response => c.json({ status: "ok", service: "user-service" }, 200));
    app.get("/metrics", metricsHandler());

    app.use("/api/v1/internal/*", requireInternalSecret(env.internalServiceSecret));
    app.use("/api/v1/internal/*", attachEntityManager(forkEntityManager));
    app.route("/api/v1/internal/auth", createAuthRoute(env, oauthStrategies));
    app.route("/api/v1/internal/users", createUserRoute());
    app.route("/api/v1/internal/admin/users", createAdminRoute());
    app.route("/api/v1/internal", createServiceRoute(env));

    app.notFound((c): Response => c.json({ error_code: "NOT_FOUND", message: "Route not found." }, 404));

    return app;
}
