import { Bell,Check,Inbox } from "lucide-react";
import type { Dispatch,SetStateAction } from "react";
import { useState,type ReactNode } from "react";
import { Link } from "react-router-dom";
import { date,useApp } from "../../../shared/context";
import type { Notice } from "../../../types";

export function Notifications(): ReactNode {
    const { data, api, refresh }: ReturnType<typeof useApp> = useApp();
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [filter, setFilter]: ["ALL" | "UNREAD", Dispatch<SetStateAction<"ALL" | "UNREAD">>] =
        useState<"ALL" | "UNREAD">("ALL");
    const unreadCount: number = data.notifications.filter(
        (item: Notice): boolean => !item.read,
    ).length;
    const notices: Notice[] = data.notifications.filter(
        (item: Notice): boolean => filter === "ALL" || !item.read,
    );
    async function mark(id: string): Promise<void> {
        try {
            setError("");
            await api.markRead(id);
            await refresh();
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không cập nhật được thông báo.");
        }
    }
    return (
        <div className="notice-page">
            <div className="notice-page-heading">
                <div className="notice-page-title">
                    <span className="notice-page-icon">
                        <Bell size={23} />
                    </span>
                    <div>
                        <p className="assessment-section-kicker">CẬP NHẬT CỦA BẠN</p>
                        <h1>Thông báo</h1>
                        <p>Theo dõi những hoạt động mới trong không gian học tập.</p>
                    </div>
                </div>
                <span className="notice-unread-count">{unreadCount} chưa đọc</span>
            </div>
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            <section className="notice-list-panel">
                <div className="notice-panel-top">
                    <div>
                        <h2>Hoạt động gần đây</h2>
                        <p>Các cập nhật liên quan đến bạn.</p>
                    </div>
                    <div className="notice-filters" aria-label="Lọc thông báo">
                        <button
                            type="button"
                            className={filter === "ALL" ? "selected" : ""}
                            aria-pressed={filter === "ALL"}
                            onClick={(): void => setFilter("ALL")}
                        >
                            Tất cả
                        </button>
                        <button
                            type="button"
                            className={filter === "UNREAD" ? "selected" : ""}
                            aria-pressed={filter === "UNREAD"}
                            onClick={(): void => setFilter("UNREAD")}
                        >
                            Chưa đọc
                        </button>
                    </div>
                </div>
                {notices.length ? (
                    <div className="notice-items">
                        {notices.map(
                            (item: Notice): ReactNode => (
                                <article
                                    className={`notice-item ${item.read ? "" : "notice-item-unread"}`}
                                    key={item.id}
                                >
                                    <span className="notice-item-icon">
                                        <Bell size={18} />
                                    </span>
                                    <div className="notice-item-content">
                                        <div className="notice-item-title">
                                            <strong>{item.title}</strong>
                                            {!item.read && <span className="notice-new">Mới</span>}
                                        </div>
                                        <p>{item.body}</p>
                                        <div className="notice-item-meta">
                                            <time dateTime={item.createdAt}>
                                                {date(item.createdAt)}
                                            </time>
                                            <Link to={item.href}>Xem nội dung</Link>
                                        </div>
                                    </div>
                                    {!item.read && (
                                        <button
                                            className="notice-mark-button"
                                            type="button"
                                            aria-label={`Đánh dấu ${item.title} đã đọc`}
                                            title="Đánh dấu đã đọc"
                                            onClick={(): void => {
                                                void mark(item.id);
                                            }}
                                        >
                                            <Check size={18} />
                                        </button>
                                    )}
                                </article>
                            ),
                        )}
                    </div>
                ) : (
                    <div className="notice-empty">
                        <Inbox size={24} />
                        <strong>
                            {filter === "UNREAD" ? "Bạn đã đọc hết thông báo" : "Chưa có thông báo"}
                        </strong>
                        <p>
                            {filter === "UNREAD"
                                ? "Các cập nhật mới sẽ xuất hiện tại đây."
                                : "Thông báo của bạn sẽ xuất hiện ở đây."}
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
