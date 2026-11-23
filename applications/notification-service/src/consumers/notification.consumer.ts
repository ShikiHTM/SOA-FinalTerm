import { type Consumer, type EachMessagePayload } from "kafkajs";
import {
    kafkaMessageProcessingDurationSeconds,
    kafkaMessagesConsumedTotal,
    lmsNotificationsCreatedTotal
} from "../metrics.ts";
import { type Notification } from "../models/notification.ts";
import { NotificationService, ValidationError } from "../services/notification.service.ts";

export async function startNotificationConsumer(consumer: Consumer, service: NotificationService): Promise<void> {
    const topic: string = process.env.KAFKA_NOTIFICATION_TOPIC ?? "notification.requested.v1";
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload): Promise<void> => {
            const startNs: bigint = process.hrtime.bigint();
            let payload: unknown;
            try {
                if (message.value === null) throw new ValidationError("Kafka message is empty.");
                payload = JSON.parse(message.value.toString("utf8")) as unknown;
            } catch (error: unknown) {
                kafkaMessagesConsumedTotal.inc({ topic, result: "invalid" });
                kafkaMessageProcessingDurationSeconds.observe(
                    { topic },
                    Number(process.hrtime.bigint() - startNs) / 1e9
                );
                process.stderr.write(`Invalid notification event: ${String(error)}\n`);
                return;
            }
            try {
                const notification: Notification | undefined = (await service.create(payload, true)) as Notification | undefined;
                const payloadType: unknown = (payload as Record<string, unknown> | null)?.type;
                const eventType: string = notification?.type ?? (typeof payloadType === "string" ? payloadType : "UNKNOWN");
                kafkaMessagesConsumedTotal.inc({ topic, result: "success" });
                lmsNotificationsCreatedTotal.inc({ type: eventType, source: "kafka" });
            } catch (error: unknown) {
                if (error instanceof ValidationError) {
                    kafkaMessagesConsumedTotal.inc({ topic, result: "invalid" });
                    process.stderr.write(`Invalid notification event: ${error.message}\n`);
                    return;
                }
                kafkaMessagesConsumedTotal.inc({ topic, result: "error" });
                throw error;
            } finally {
                kafkaMessageProcessingDurationSeconds.observe(
                    { topic },
                    Number(process.hrtime.bigint() - startNs) / 1e9
                );
            }
        }
    });
}
