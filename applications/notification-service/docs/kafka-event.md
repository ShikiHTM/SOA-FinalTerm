# Kafka Event Contract (proposed)

Proposed contract; the topic and payload require agreement with the producing services.

- Topic: `notification.requested.v1` (`KAFKA_NOTIFICATION_TOPIC`)
- Consumer group: `notification-service` (default)
- Set `KAFKA_ENABLED=true` and `KAFKA_BROKERS` to connect to the team's broker.
- `KAFKA_GROUP_ID` can override the consumer group when passed to the service; the current Compose configuration does not forward it.

## Message

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

- Required nonempty strings: `event_id`, `recipient_user_id`, `type`, `title`, `body`.
- Optional: `resource_type`, `resource_id`. Allowed type values are in [OpenAPI](openapi.yaml).
- Use a globally unique `event_id` for each recipient's notification; repeated IDs do not create another record.
- Invalid messages are logged and skipped; no dead-letter topic is configured. Database errors are propagated for Kafka retry.
