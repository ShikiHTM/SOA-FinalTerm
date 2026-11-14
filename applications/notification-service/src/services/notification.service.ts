import { type Notification, type NotificationInput } from "../models/notification.ts";
import { NotificationRepository } from "../repositories/notification.repository.ts";

const NOTIFICATION_TYPES: string[] = ["GROUP_JOIN_APPROVED", "GROUP_JOIN_REJECTED", "CONTEST_PUBLISHED", "CONTEST_STARTING", "SUBMISSION_GRADED"];
const RESOURCE_TYPES: string[] = ["GROUP", "CONTEST", "SUBMISSION"];

export class ValidationError extends Error {}

export function parseNotification(value: unknown, requireEventId: boolean = false): NotificationInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new ValidationError("Request body must be a JSON object.");
    }
    const payload: Record<string, unknown> = value as Record<string, unknown>;
    for (const field of ["recipient_user_id", "type", "title", "body"]) {
        if (typeof payload[field] !== "string" || (payload[field] as string).trim().length === 0) {
            throw new ValidationError(`${field} is required.`);
        }
    }
    if (!NOTIFICATION_TYPES.includes(payload.type as string)) {
        throw new ValidationError("type is not a supported notification type.");
    }
    if (payload.resource_type !== undefined && (typeof payload.resource_type !== "string" || !RESOURCE_TYPES.includes(payload.resource_type))) {
        throw new ValidationError("resource_type is not supported.");
    }
    if (payload.resource_id !== undefined && typeof payload.resource_id !== "string") {
        throw new ValidationError("resource_id must be a string.");
    }
    if (requireEventId && (typeof payload.event_id !== "string" || payload.event_id.trim().length === 0)) {
        throw new ValidationError("event_id is required for Kafka messages.");
    }
    return {
        recipientUserId: (payload.recipient_user_id as string).trim(),
        type: payload.type as string,
        title: (payload.title as string).trim(),
        body: (payload.body as string).trim(),
        resourceType: (payload.resource_type as string | undefined) ?? null,
        resourceId: (payload.resource_id as string | undefined) ?? null,
        eventId: requireEventId ? (payload.event_id as string).trim() : null
    };
}

export function toApiNotification(notification: Notification): Record<string, unknown> {
    return {
        id: notification.id,
        recipient_user_id: notification.recipientUserId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        resource_type: notification.resourceType,
        resource_id: notification.resourceId,
        is_read: notification.isRead,
        created_at: notification.createdAt.toISOString()
    };
}

export class NotificationService {
    private readonly repository: NotificationRepository;

    constructor(repository: NotificationRepository) {
        this.repository = repository;
    }

    async create(payload: unknown, requireEventId: boolean = false): Promise<Notification> {
        return this.repository.create(parseNotification(payload, requireEventId));
    }

    async list(userId: string, unreadOnly: boolean, limit: number): Promise<Notification[]> {
        return this.repository.list(userId, unreadOnly, limit);
    }

    async markRead(id: string, userId: string): Promise<boolean> {
        return this.repository.markRead(id, userId);
    }
}
