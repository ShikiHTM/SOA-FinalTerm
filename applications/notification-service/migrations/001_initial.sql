CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY,
    recipient_user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    resource_type text,
    resource_id text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    event_id text UNIQUE
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx ON notifications (recipient_user_id, created_at DESC) WHERE is_read = false;
