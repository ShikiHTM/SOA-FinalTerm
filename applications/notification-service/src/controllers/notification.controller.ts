import { type IncomingMessage, type ServerResponse } from "node:http";
import { type Notification } from "../models/notification.ts";
import { NotificationService, ValidationError, toApiNotification } from "../services/notification.service.ts";

const MAX_BODY_BYTES: number = 1024 * 1024;

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}

export function sendError(response: ServerResponse, statusCode: number, errorCode: string, message: string): void {
    sendJson(response, statusCode, { error_code: errorCode, message });
}

function getUserId(request: IncomingMessage): string | undefined {
    const value: string | string[] | undefined = request.headers["x-user-id"];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size: number = 0;
    for await (const chunk of request) {
        const buffer: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_BODY_BYTES) throw new RangeError("Request body exceeds the 1 MB limit.");
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export class NotificationController {
    private readonly service: NotificationService;

    constructor(service: NotificationService) {
        this.service = service;
    }

    async create(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const secret: string = process.env.INTERNAL_SERVICE_SECRET ?? "";
        if (!secret) {
            sendError(response, 503, "SERVICE_NOT_CONFIGURED", "INTERNAL_SERVICE_SECRET is not configured.");
            return;
        }
        if (request.headers["x-internal-secret"] !== secret) {
            sendError(response, 401, "UNAUTHORIZED", "A valid internal service secret is required.");
            return;
        }
        try {
            const payload: unknown = await readBody(request);
            const notification: Notification = await this.service.create(payload);
            sendJson(response, 201, toApiNotification(notification));
        } catch (error: unknown) {
            if (error instanceof RangeError) sendError(response, 413, "PAYLOAD_TOO_LARGE", error.message);
            else if (error instanceof ValidationError || error instanceof SyntaxError) sendError(response, 400, "BAD_REQUEST", error.message);
            else throw error;
        }
    }

    async list(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
        const userId: string | undefined = getUserId(request);
        if (!userId) {
            sendError(response, 401, "UNAUTHORIZED", "The API Gateway must provide X-User-Id.");
            return;
        }
        const unread: string | null = url.searchParams.get("unread_only");
        const limitValue: string = url.searchParams.get("limit") ?? "20";
        const limit: number = Number(limitValue);
        if ((unread !== null && unread !== "true" && unread !== "false") || !/^\d+$/.test(limitValue) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            sendError(response, 400, "BAD_REQUEST", "Invalid unread_only or limit parameter.");
            return;
        }
        const notifications: Notification[] = await this.service.list(userId, unread === "true", limit);
        sendJson(response, 200, notifications.map((notification: Notification): Record<string, unknown> => toApiNotification(notification)));
    }

    async markRead(request: IncomingMessage, response: ServerResponse, id: string): Promise<void> {
        const userId: string | undefined = getUserId(request);
        if (!userId) {
            sendError(response, 401, "UNAUTHORIZED", "The API Gateway must provide X-User-Id.");
            return;
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !(await this.service.markRead(id, userId))) {
            sendError(response, 404, "NOT_FOUND", "Notification was not found.");
            return;
        }
        response.writeHead(204);
        response.end();
    }
}
