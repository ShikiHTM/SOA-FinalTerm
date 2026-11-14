import { type Consumer, type EachMessagePayload } from "kafkajs";
import { NotificationService, ValidationError } from "../services/notification.service.ts";

export async function startNotificationConsumer(consumer: Consumer, service: NotificationService): Promise<void> {
    const topic: string = process.env.KAFKA_NOTIFICATION_TOPIC ?? "notification.requested.v1";
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload): Promise<void> => {
            let payload: unknown;
            try {
                if (message.value === null) throw new ValidationError("Kafka message is empty.");
                payload = JSON.parse(message.value.toString("utf8")) as unknown;
            } catch (error: unknown) {
                process.stderr.write(`Invalid notification event: ${String(error)}\n`);
                return;
            }
            try {
                await service.create(payload, true);
            } catch (error: unknown) {
                if (error instanceof ValidationError) {
                    process.stderr.write(`Invalid notification event: ${error.message}\n`);
                    return;
                }
                throw error;
            }
        }
    });
}
