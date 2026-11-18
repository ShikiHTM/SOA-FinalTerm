export type Notification = {
    id: string;
    recipientUserId: string;
    type: string;
    title: string;
    body: string;
    resourceType: string | null;
    resourceId: string | null;
    isRead: boolean;
    createdAt: Date;
    eventId: string | null;
};

export type NotificationInput = {
    recipientUserId: string;
    type: string;
    title: string;
    body: string;
    resourceType: string | null;
    resourceId: string | null;
    eventId: string | null;
};
