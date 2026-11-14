import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import { type Consumer, type EachMessagePayload } from "kafkajs";
import { createKafkaConsumer } from "../src/config/kafka.ts";
import { type Notification, type NotificationInput } from "../src/models/notification.ts";
import { startNotificationConsumer } from "../src/consumers/notification.consumer.ts";
import { NotificationController, sendError } from "../src/controllers/notification.controller.ts";
import { type NotificationRepository } from "../src/repositories/notification.repository.ts";
import { handleRequest } from "../src/routes/notification.routes.ts";
import { NotificationService, ValidationError, parseNotification } from "../src/services/notification.service.ts";

const VALID_EVENT: Record<string, string> = {
    event_id: "event-1",
    recipient_user_id: "user-1",
    type: "CONTEST_PUBLISHED",
    title: "New contest",
    body: "A contest is available."
};

test("Kafka is optional and requires explicit brokers when enabled", (): void => {
    const previousEnabled: string | undefined = process.env.KAFKA_ENABLED;
    const previousBrokers: string | undefined = process.env.KAFKA_BROKERS;
    try {
        process.env.KAFKA_ENABLED = "false";
        assert.equal(createKafkaConsumer(), null);
        process.env.KAFKA_ENABLED = "true";
        delete process.env.KAFKA_BROKERS;
        assert.throws((): Consumer | null => createKafkaConsumer(), /KAFKA_BROKERS/);
    } finally {
        if (previousEnabled === undefined) delete process.env.KAFKA_ENABLED;
        else process.env.KAFKA_ENABLED = previousEnabled;
        if (previousBrokers === undefined) delete process.env.KAFKA_BROKERS;
        else process.env.KAFKA_BROKERS = previousBrokers;
    }
});

test("validates Kafka events and requires an event ID", (): void => {
    assert.equal(parseNotification(VALID_EVENT, true).eventId, "event-1");
    assert.throws((): NotificationInput => parseNotification({ ...VALID_EVENT, event_id: "" }, true), ValidationError);
    assert.throws((): NotificationInput => parseNotification({ ...VALID_EVENT, type: "UNKNOWN" }, true), ValidationError);
});

test("Kafka consumer delegates valid events and propagates storage errors", async (): Promise<void> => {
    let handler: ((payload: EachMessagePayload) => Promise<void>) | undefined;
    let received: unknown;
    let eventIdRequired: boolean | undefined;
    const consumer = {
        connect: async (): Promise<void> => { return; },
        subscribe: async (): Promise<void> => { return; },
        run: async (options: { eachMessage: (payload: EachMessagePayload) => Promise<void> }): Promise<void> => { handler = options.eachMessage; }
    } as unknown as Consumer;
    const service = {
        create: async (payload: unknown, requireEventId: boolean): Promise<void> => {
            received = payload;
            eventIdRequired = requireEventId;
        }
    } as unknown as NotificationService;
    await startNotificationConsumer(consumer, service);
    assert.ok(handler);
    await handler({ message: { value: Buffer.from(JSON.stringify(VALID_EVENT)) } } as EachMessagePayload);
    assert.deepEqual(received, VALID_EVENT);
    assert.equal(eventIdRequired, true);
    service.create = async (): Promise<never> => { throw new Error("database unavailable"); };
    await assert.rejects(handler({ message: { value: Buffer.from(JSON.stringify(VALID_EVENT)) } } as EachMessagePayload), /database unavailable/);
});

test("REST routes apply auth, user filtering and CORS", async (): Promise<void> => {
    const records: Notification[] = [];
    const repository = {
        create: async (input: NotificationInput): Promise<Notification> => {
            const notification: Notification = {
                id: "713a7092-2c15-4273-aa52-e52ce1b086d7",
                ...input,
                isRead: false,
                createdAt: new Date()
            } as Notification;
            records.push(notification);
            return notification;
        },
        list: async (userId: string, unreadOnly: boolean, limit: number): Promise<Notification[]> => records.filter((item: Notification): boolean => item.recipientUserId === userId && (!unreadOnly || !item.isRead)).slice(0, limit),
        markRead: async (id: string, userId: string): Promise<boolean> => {
            const item: Notification | undefined = records.find((entry: Notification): boolean => entry.id === id && entry.recipientUserId === userId);
            if (!item) return false;
            item.isRead = true;
            return true;
        }
    } as unknown as NotificationRepository;
    const controller: NotificationController = new NotificationController(new NotificationService(repository));
    const server: Server = createServer((request, response): void => {
        void handleRequest(request, response, controller).catch((): void => sendError(response, 500, "ERROR", "Unexpected error"));
    });
    await new Promise<void>((resolve): void => { server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl: string = `http://127.0.0.1:${address.port}/api/v1`;
    process.env.INTERNAL_SERVICE_SECRET = "test-secret";
    try {
        const preflight: Response = await fetch(`${baseUrl}/internal/notifications`, { method: "OPTIONS", headers: { Origin: "http://localhost:8080", "Access-Control-Request-Method": "POST" } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:8080");
        const unauthorized: Response = await fetch(`${baseUrl}/internal/notifications`, { method: "POST" });
        assert.equal(unauthorized.status, 401);
        const created: Response = await fetch(`${baseUrl}/internal/notifications`, { method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Secret": "test-secret" }, body: JSON.stringify(VALID_EVENT) });
        assert.equal(created.status, 201);
        const other: Response = await fetch(`${baseUrl}/notifications`, { headers: { "X-User-Id": "user-2" } });
        assert.deepEqual(await other.json(), []);
        const otherMark: Response = await fetch(`${baseUrl}/notifications/713a7092-2c15-4273-aa52-e52ce1b086d7/read`, { method: "PATCH", headers: { "X-User-Id": "user-2" } });
        assert.equal(otherMark.status, 404);
        const disallowedOrigin: Response = await fetch(`${baseUrl}/notifications`, { headers: { Origin: "http://example.invalid", "X-User-Id": "user-1" } });
        assert.equal(disallowedOrigin.status, 403);
        const mark: Response = await fetch(`${baseUrl}/notifications/713a7092-2c15-4273-aa52-e52ce1b086d7/read`, { method: "PATCH", headers: { "X-User-Id": "user-1" } });
        assert.equal(mark.status, 204);
        const unread: Response = await fetch(`${baseUrl}/notifications?unread_only=true`, { headers: { "X-User-Id": "user-1" } });
        assert.deepEqual(await unread.json(), []);
    } finally {
        await new Promise<void>((resolve, reject): void => { server.close((error?: Error): void => error ? reject(error) : resolve()); });
    }
});
