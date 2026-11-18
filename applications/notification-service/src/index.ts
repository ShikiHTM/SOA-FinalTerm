import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type Pool } from "pg";
import { type Consumer } from "kafkajs";
import { connectDatabase } from "./config/database.ts";
import { createKafkaConsumer } from "./config/kafka.ts";
import { startNotificationConsumer } from "./consumers/notification.consumer.ts";
import { NotificationController, sendError } from "./controllers/notification.controller.ts";
import { NotificationRepository } from "./repositories/notification.repository.ts";
import { handleRequest } from "./routes/notification.routes.ts";
import { NotificationService } from "./services/notification.service.ts";

const PORT: number = Number.parseInt(process.env.PORT ?? "3037", 10);

async function startServer(): Promise<void> {
    const pool: Pool = await connectDatabase();
    const service: NotificationService = new NotificationService(new NotificationRepository(pool));
    const controller: NotificationController = new NotificationController(service);
    const consumer: Consumer | null = createKafkaConsumer();
    if (consumer !== null) {
        try {
            await startNotificationConsumer(consumer, service);
        } catch (error: unknown) {
            await consumer.disconnect();
            await pool.end();
            throw error;
        }
    }
    const server: Server = createServer((request: IncomingMessage, response: ServerResponse): void => {
        void handleRequest(request, response, controller).catch((error: unknown): void => {
            process.stderr.write(`Request failed: ${String(error)}\n`);
            sendError(response, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
        });
    });
    const shutdown: () => Promise<void> = async (): Promise<void> => {
        server.close();
        if (consumer !== null) await consumer.disconnect();
        await pool.end();
    };
    process.once("SIGINT", (): void => { void shutdown(); });
    process.once("SIGTERM", (): void => { void shutdown(); });
    server.listen(PORT, "0.0.0.0", (): void => {
        process.stdout.write(`Notification Service listening on port ${PORT}\n`);
    });
}

void startServer().catch((error: unknown): void => {
    process.stderr.write(`Notification Service failed to start: ${String(error)}\n`);
    process.exitCode = 1;
});
