import { Kafka, type Consumer } from "kafkajs";

export function createKafkaConsumer(): Consumer | null {
    if (process.env.KAFKA_ENABLED !== "true") return null;
    const brokers: string[] = (process.env.KAFKA_BROKERS ?? "").split(",").map((broker: string): string => broker.trim()).filter(Boolean);
    if (brokers.length === 0) throw new Error("KAFKA_BROKERS must contain at least one broker");
    const kafka: Kafka = new Kafka({ clientId: "notification-service", brokers });
    return kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID ?? "notification-service" });
}
