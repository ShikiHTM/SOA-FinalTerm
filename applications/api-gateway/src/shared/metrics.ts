import type { Context, MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import {
    Counter,
    Gauge,
    Histogram,
    Registry,
    collectDefaultMetrics
} from "prom-client";
import type { AppEnv } from "./types";

const HTTP_DURATION_BUCKETS: number[] = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
];

const registry: Registry = new Registry();
registry.setDefaultLabels({ service: "api-gateway" });
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal: Counter<"method" | "route" | "status_class"> = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests handled by the service.",
    labelNames: ["method", "route", "status_class"] as const,
    registers: [registry]
});

export const httpRequestDurationSeconds: Histogram<"method" | "route"> = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route"] as const,
    buckets: HTTP_DURATION_BUCKETS,
    registers: [registry]
});

export const httpRequestsInFlight: Gauge<string> = new Gauge({
    name: "http_requests_in_flight",
    help: "Number of HTTP requests currently in progress.",
    registers: [registry]
});

export const gatewayUpstreamRequestsTotal: Counter<"upstream" | "status_class"> = new Counter({
    name: "gateway_upstream_requests_total",
    help: "Total number of upstream requests proxied by the API Gateway.",
    labelNames: ["upstream", "status_class"] as const,
    registers: [registry]
});

export const gatewayUpstreamDurationSeconds: Histogram<"upstream"> = new Histogram({
    name: "gateway_upstream_duration_seconds",
    help: "Duration in seconds of upstream requests sent by the API Gateway.",
    labelNames: ["upstream"] as const,
    buckets: HTTP_DURATION_BUCKETS,
    registers: [registry]
});

export const gatewayAuthVerificationsTotal: Counter<"result"> = new Counter({
    name: "gateway_auth_verifications_total",
    help: "Total number of bearer token verifications performed by the API Gateway.",
    labelNames: ["result"] as const,
    registers: [registry]
});

export function toStatusClass(status: number): string {
    if (status < 100) {
        return "unknown";
    }
    return `${Math.floor(status / 100)}xx`;
}

export function metricsMiddleware(): MiddlewareHandler<AppEnv> {
    return async (c, next): Promise<void> => {
        if (c.req.path === "/metrics" || c.req.path === "/health") {
            await next();
            return;
        }
        httpRequestsInFlight.inc();
        const startNs: bigint = process.hrtime.bigint();
        try {
            await next();
        } finally {
            httpRequestsInFlight.dec();
            const durationSeconds: number = Number(process.hrtime.bigint() - startNs) / 1e9;
            const status: number = c.res.status;
            const matched: string | undefined = routePath(c);
            const route: string =
                status === 404 || !matched || matched === "/*" ? "unmatched" : matched;
            const method: string = c.req.method.toUpperCase();
            httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
            httpRequestsTotal.inc({
                method,
                route,
                status_class: toStatusClass(status)
            });
        }
    };
}

export function metricsHandler(): (c: Context) => Promise<Response> {
    return async (): Promise<Response> => {
        const body: string = await registry.metrics();
        return new Response(body, {
            status: 200,
            headers: { "Content-Type": registry.contentType }
        });
    };
}
