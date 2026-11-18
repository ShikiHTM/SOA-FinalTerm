import { type IncomingMessage, type ServerResponse } from "node:http";
import { NotificationController, sendError, sendJson } from "../controllers/notification.controller.ts";

const CORS_ALLOWED_ORIGINS: string[] = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:8080").split(",").map((origin: string): string => origin.trim()).filter(Boolean);

export async function handleRequest(request: IncomingMessage, response: ServerResponse, controller: NotificationController): Promise<void> {
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
    if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
    }
    const url: URL = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const path: string = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "GET" && (path === "/health" || path === "/api/v1/health")) {
        sendJson(response, 200, { status: "ok", service: "notification-service" });
        return;
    }
    if (request.method === "POST" && path === "/api/v1/internal/notifications") {
        await controller.create(request, response);
        return;
    }
    if (request.method === "GET" && path === "/api/v1/notifications") {
        await controller.list(request, response, url);
        return;
    }
    const match: RegExpMatchArray | null = path.match(/^\/api\/v1\/notifications\/([^/]+)\/read$/);
    if (request.method === "PATCH" && match !== null) {
        await controller.markRead(request, response, decodeURIComponent(match[1]));
        return;
    }
    sendError(response, 404, "NOT_FOUND", "The requested endpoint was not found.");
}
