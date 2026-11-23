import {
    Counter,
    Gauge,
    Histogram,
    Registry,
    collectDefaultMetrics
} from "prom-client";

const HTTP_DURATION_BUCKETS: number[] = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
];

export const metricsRegistry: Registry = new Registry();
metricsRegistry.setDefaultLabels({ service: "notification-service" });
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal: Counter<"method" | "route" | "status_class"> = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests handled by the service.",
    labelNames: ["method", "route", "status_class"] as const,
    registers: [metricsRegistry]
});

export const httpRequestDurationSeconds: Histogram<"method" | "route"> = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route"] as const,
    buckets: HTTP_DURATION_BUCKETS,
    registers: [metricsRegistry]
});

export const httpRequestsInFlight: Gauge<string> = new Gauge({
    name: "http_requests_in_flight",
    help: "Number of HTTP requests currently in progress.",
    registers: [metricsRegistry]
});

export const kafkaMessagesConsumedTotal: Counter<"topic" | "result"> = new Counter({
    name: "kafka_messages_consumed_total",
    help: "Total number of Kafka messages consumed by the service.",
    labelNames: ["topic", "result"] as const,
    registers: [metricsRegistry]
});

export const kafkaMessageProcessingDurationSeconds: Histogram<"topic"> = new Histogram({
    name: "kafka_message_processing_duration_seconds",
    help: "Kafka message processing duration in seconds.",
    labelNames: ["topic"] as const,
    buckets: HTTP_DURATION_BUCKETS,
    registers: [metricsRegistry]
});

export const lmsNotificationsCreatedTotal: Counter<"type" | "source"> = new Counter({
    name: "lms_notifications_created_total",
    help: "Total number of notifications persisted by type and ingress source.",
    labelNames: ["type", "source"] as const,
    registers: [metricsRegistry]
});

export function toStatusClass(status: number): string {
    if (status < 100) {
        return "unknown";
    }
    return `${Math.floor(status / 100)}xx`;
}
