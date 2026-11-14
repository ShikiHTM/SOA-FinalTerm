# Kafka event contract (proposed)

Topic: `notification.requested.v1` (configurable with `KAFKA_NOTIFICATION_TOPIC`). Consumer group: `notification-service` (configurable with `KAFKA_GROUP_ID`). This contract needs agreement with the producing services; no producer is implemented in this repository yet.

The producer identifies the recipient and provides a globally unique `event_id` for each recipient's notification. The consumer persists the notification before completing message handling. A unique database constraint on `event_id` makes Kafka redelivery idempotent.

```json
{
    "event_id": "8ed8acfd-4df0-4c2a-938f-6facbd264560",
    "recipient_user_id": "user-001",
    "type": "CONTEST_PUBLISHED",
    "title": "New contest",
    "body": "A contest is available.",
    "resource_type": "CONTEST",
    "resource_id": "contest-001"
}
```

`event_id`, `recipient_user_id`, `type`, `title` and `body` are required nonempty strings; resource fields are optional. Allowed values for `type` and `resource_type` match the REST OpenAPI contract. Messages with invalid JSON or invalid fields are logged and skipped, not sent to a dead-letter topic. Database failures are propagated so Kafka can retry; after a restart or retry, the unique event ID prevents duplicates. The consumer does not schedule reminders or determine recipients.

For integration testing, publish the sample event to the team's shared broker using the producer tooling supplied by the team. Call `GET /api/v1/notifications` with `X-User-Id: user-001` to inspect the result. Publishing the same event again should not create a duplicate. This service does not deploy its own Kafka broker.
