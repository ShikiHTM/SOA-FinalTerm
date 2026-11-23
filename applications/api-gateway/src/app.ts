import { Hono } from "hono";
import { cors } from "hono/cors";
import { createGatewayRoutes, type TokenVerifier } from "./gateway/routes";
import { loadEnvConfig, type EnvConfig } from "./shared/env";
import { handleAppError } from "./shared/errors";
import { metricsHandler, metricsMiddleware } from "./shared/metrics";
import type { AppEnv } from "./shared/types";

export interface AppDependencies {
    env?: EnvConfig;
    verifyToken?: TokenVerifier;
}

export function createApp(dependencies: AppDependencies = {}): Hono<AppEnv> {
    const env: EnvConfig = dependencies.env ?? loadEnvConfig();
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
            allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
            maxAge: 600
        })
    );

    app.use("*", metricsMiddleware());

    app.get(
        "/health",
        (c): Response => c.json({ status: "ok", service: "api-gateway" }, 200)
    );

    app.get("/metrics", metricsHandler());

    app.route("/api/v1", createGatewayRoutes(env, dependencies.verifyToken));

    app.notFound(
        (c): Response => c.json({ error_code: "NOT_FOUND", message: "Route not found." }, 404)
    );

    return app;
}
