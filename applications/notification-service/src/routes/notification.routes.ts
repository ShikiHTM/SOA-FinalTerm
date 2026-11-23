import { type IncomingMessage, type ServerResponse } from "node:http";
import { NotificationController, sendError, sendJson } from "../controllers/notification.controller.ts";
import {
    httpRequestDurationSeconds,
    httpRequestsInFlight,
    httpRequestsTotal,
    metricsRegistry,
    toStatusClass
} from "../metrics.ts";

const CORS_ALLOWED_ORIGINS: string[] = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:8080").split(",").map((origin: string): string => origin.trim()).filter(Boolean);

function resolveRoute(method: string, path: string): string {
    if (method === "POST" && path === "/api/v1/internal/notifications") {
        return "/api/v1/internal/notifications";
    }
    if (method === "GET" && path === "/api/v1/notifications") {
        return "/api/v1/notifications";
    }
    if (method === "PATCH" && /^\/api\/v1\/notifications\/[^/]+\/read$/.test(path)) {
        return "/api/v1/notifications/:id/read";
    }
    return "unmatched";
}

export async function handleRequest(request: IncomingMessage, response: ServerResponse, controller: NotificationController): Promise<void> {
    const url: URL = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const path: string = url.pathname.replace(/\/+$/, "") || "/";
    const method: string = (request.method ?? "GET").toUpperCase();

    if (method === "GET" && path === "/metrics") {
        const body: string = await metricsRegistry.metrics();
        response.writeHead(200, { "content-type": metricsRegistry.contentType });
        response.end(body);
        return;
    }

    const origin: string | undefined = request.headers.origin;
    if (origin !== undefined) {
        if (!CORS_ALLOWED_ORIGINS.includes(origin)) {
            sendError(response, 403, "FORBIDDEN", "This browser origin is not allowed.");
            return;
        }
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Internal-Secret, X-User-Id");
        response.setHeader("Access-Control-Max-Age", "600");
        response.setHeader("Vary", "Origin");
    }
    if (method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
    }
    if (method === "GET" && (path === "/health" || path === "/api/v1/health")) {
        sendJson(response, 200, { status: "ok", service: "notification-service" });
        return;
    }

    const route: string = resolveRoute(method, path);
    httpRequestsInFlight.inc();
    const startNs: bigint = process.hrtime.bigint();
    try {
        if (method === "POST" && path === "/api/v1/internal/notifications") {
            await controller.create(request, response);
            return;
        }
        if (method === "GET" && path === "/api/v1/notifications") {
            await controller.list(request, response, url);
            return;
        }
        const match: RegExpMatchArray | null = path.match(/^\/api\/v1\/notifications\/([^/]+)\/read$/);
        if (method === "PATCH" && match !== null) {
            await controller.markRead(request, response, decodeURIComponent(match[1]));
            return;
        }
        sendError(response, 404, "NOT_FOUND", "The requested endpoint was not found.");
    } finally {
        httpRequestsInFlight.dec();
        const durationSeconds: number = Number(process.hrtime.bigint() - startNs) / 1e9;
        httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
        httpRequestsTotal.inc({
            method,
            route,
            status_class: toStatusClass(response.statusCode)
        });
    }
}
