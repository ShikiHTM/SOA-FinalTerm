import { randomUUID } from "node:crypto";
import { type Pool, type QueryResult } from "pg";
import { type Notification, type NotificationInput } from "../models/notification.ts";

const NOTIFICATION_COLUMNS: string = `
    id,
    recipient_user_id AS "recipientUserId",
    type,
    title,
    body,
    resource_type AS "resourceType",
    resource_id AS "resourceId",
    is_read AS "isRead",
    created_at AS "createdAt",
    event_id AS "eventId"
`;

export class NotificationRepository {
    private readonly pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async create(input: NotificationInput): Promise<Notification> {
        const result: QueryResult<Notification> = await this.pool.query<Notification>(
            `INSERT INTO notifications
                (id, recipient_user_id, type, title, body, resource_type, resource_id, event_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id
             RETURNING ${NOTIFICATION_COLUMNS}`,
            [randomUUID(), input.recipientUserId, input.type, input.title, input.body, input.resourceType, input.resourceId, input.eventId]
        );
        return result.rows[0];
    }

    async list(userId: string, unreadOnly: boolean, limit: number): Promise<Notification[]> {
        const result: QueryResult<Notification> = await this.pool.query<Notification>(
            `SELECT ${NOTIFICATION_COLUMNS}
             FROM notifications
             WHERE recipient_user_id = $1 AND ($2::boolean = false OR is_read = false)
             ORDER BY created_at DESC
             LIMIT $3`,
            [userId, unreadOnly, limit]
        );
        return result.rows;
    }

    async markRead(id: string, userId: string): Promise<boolean> {
        const result: QueryResult = await this.pool.query(
            `UPDATE notifications
             SET is_read = true
             WHERE id = $1 AND recipient_user_id = $2
             RETURNING id`,
            [id, userId]
        );
        return (result.rowCount ?? 0) > 0;
    }
}
