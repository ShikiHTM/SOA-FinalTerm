import {
    Bell,
    Check,
    CheckCheck,
    ExternalLink
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link } from "react-router-dom";
import { notificationsApi } from "../../../api/client";
import type { NotificationItem, NotificationType } from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { PageTitle, formatDate, useApp } from "../../../shared/context";

type NotificationFilter = "ALL" | "UNREAD";

function resourceLink(item: NotificationItem): { to: string; label: string } | null {
    if (!item.resource_id || !item.resource_type) {
        return null;
    }
    if (item.resource_type === "GROUP") {
        return { to: `/groups/${item.resource_id}`, label: "View group" };
    }
    if (item.resource_type === "CONTEST") {
        return { to: `/contests/${item.resource_id}`, label: "View contest" };
    }
    if (item.resource_type === "SUBMISSION") {
        return { to: `/submissions/${item.resource_id}`, label: "View submission" };
    }
    return null;
}

function typeLabel(type: NotificationType): string {
    if (type === "GROUP_JOIN_APPROVED") {
        return "Group approved";
    }
    if (type === "GROUP_JOIN_REJECTED") {
        return "Group declined";
    }
    if (type === "CONTEST_PUBLISHED") {
        return "Contest published";
    }
    if (type === "CONTEST_STARTING") {
        return "Contest starting";
    }
    return "Submission graded";
}

export function Notifications(): ReactNode {
    const { refreshNotifications } = useApp();
    const [items, setItems]: [NotificationItem[], Dispatch<SetStateAction<NotificationItem[]>>] =
        useState<NotificationItem[]>([]);
    const [filter, setFilter]: [NotificationFilter, Dispatch<SetStateAction<NotificationFilter>>] =
        useState<NotificationFilter>("ALL");
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [busyId, setBusyId]: [string | null, Dispatch<SetStateAction<string | null>>] =
        useState<string | null>(null);
    const [markingAll, setMarkingAll]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const loadNotifications: () => Promise<void> = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError("");
        try {
            const list: NotificationItem[] = await notificationsApi.list({
                unread_only: filter === "UNREAD",
                limit: 100
            });
            setItems(list);
        } catch (err: unknown) {
            setError(extractErrorMessage(err, "Unable to load notifications."));
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect((): void => {
        void loadNotifications();
    }, [loadNotifications]);

    async function handleMarkRead(id: string): Promise<void> {
        setBusyId(id);
        setError("");
        try {
            await notificationsApi.markRead(id);
            setItems((prev: NotificationItem[]): NotificationItem[] =>
                filter === "UNREAD"
                    ? prev.filter((item: NotificationItem): boolean => item.id !== id)
                    : prev.map((item: NotificationItem): NotificationItem =>
                          item.id === id ? { ...item, is_read: true } : item
                      )
            );
            await refreshNotifications();
        } catch (err: unknown) {
            setError(extractErrorMessage(err, "Unable to update notification status."));
        } finally {
            setBusyId(null);
        }
    }

    async function handleMarkAllRead(): Promise<void> {
        const unread: NotificationItem[] = items.filter(
            (item: NotificationItem): boolean => !item.is_read
        );
        if (unread.length === 0) {
            return;
        }

        setMarkingAll(true);
        setError("");
        try {
            await Promise.all(
                unread.map((item: NotificationItem): Promise<void> =>
                    notificationsApi.markRead(item.id)
                )
            );
            setItems((prev: NotificationItem[]): NotificationItem[] =>
                filter === "UNREAD"
                    ? []
                    : prev.map((item: NotificationItem): NotificationItem => ({
                          ...item,
                          is_read: true
                      }))
            );
            await refreshNotifications();
        } catch (err: unknown) {
            setError(extractErrorMessage(err, "Unable to mark notifications as read."));
        } finally {
            setMarkingAll(false);
        }
    }

    const unreadCount: number = items.filter(
        (item: NotificationItem): boolean => !item.is_read
    ).length;

    return (
        <div className="page-enter">
            <PageTitle
                label="Inbox"
                title="Notifications"
                description="Stay up to date with group approvals, contest schedules, and grading results."
                action={
                    unreadCount > 0 ? (
                        <button
                            className="button"
                            type="button"
                            disabled={markingAll}
                            onClick={(): void => {
                                void handleMarkAllRead();
                            }}
                        >
                            <CheckCheck size={16} />{" "}
                            {markingAll ? "Marking read..." : "Mark all as read"}
                        </button>
                    ) : undefined
                }
            />

            <section className="panel">
                <div className="discover-controls">
                    <div className="filter-pills" role="group" aria-label="Filter notifications">
                        <button
                            type="button"
                            className={filter === "ALL" ? "filter-pill active" : "filter-pill"}
                            onClick={(): void => setFilter("ALL")}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            className={filter === "UNREAD" ? "filter-pill active" : "filter-pill"}
                            onClick={(): void => setFilter("UNREAD")}
                        >
                            Unread
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}

                {loading ? (
                    <div className="skeleton-stack" aria-busy="true">
                        <div className="skeleton-block" />
                        <div className="skeleton-block" />
                    </div>
                ) : items.length === 0 ? (
                    <p className="empty">
                        {filter === "UNREAD"
                            ? "You have no unread notifications."
                            : "No notifications yet."}
                    </p>
                ) : (
                    <div className="resource-list">
                        {items.map((item: NotificationItem): ReactNode => {
                            const destination: { to: string; label: string } | null =
                                resourceLink(item);
                            return (
                                <article
                                    key={item.id}
                                    className={
                                        item.is_read
                                            ? "resource-row"
                                            : "resource-row resource-row-unread"
                                    }
                                >
                                    <div className="resource-row-main">
                                        <div className="resource-row-badges">
                                            <span className="badge">
                                                <Bell size={13} /> {typeLabel(item.type)}
                                            </span>
                                            {!item.is_read && <span className="badge">Unread</span>}
                                        </div>
                                        <h2 className="resource-row-title">{item.title}</h2>
                                        <p className="muted">{item.body}</p>
                                        <div className="resource-row-meta">
                                            <span>{formatDate(item.created_at)}</span>
                                        </div>
                                    </div>
                                    <div className="resource-row-actions">
                                        {destination && (
                                            <Link
                                                className="button button-small"
                                                to={destination.to}
                                                onClick={(): void => {
                                                    if (!item.is_read) {
                                                        void notificationsApi
                                                            .markRead(item.id)
                                                            .then((): Promise<void> =>
                                                                refreshNotifications()
                                                            )
                                                            .catch((): undefined => undefined);
                                                    }
                                                }}
                                            >
                                                {destination.label} <ExternalLink size={13} />
                                            </Link>
                                        )}
                                        {!item.is_read && (
                                            <button
                                                type="button"
                                                className="button button-small"
                                                disabled={busyId === item.id}
                                                onClick={(): void => {
                                                    void handleMarkRead(item.id);
                                                }}
                                            >
                                                <Check size={14} />{" "}
                                                {busyId === item.id ? "Updating..." : "Mark read"}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
