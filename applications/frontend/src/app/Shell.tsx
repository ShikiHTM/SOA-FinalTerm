import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, BookOpen, ClipboardList, Home, LogOut, Users } from "lucide-react";
import { getServices } from "../data/services";
import type { Account } from "../data/contracts/services";
import type { DataSource } from "../data/contracts/dataSource";
import type { Notice, Snapshot } from "../types";
import type { Context } from "../shared/context";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";

export function Shell({
    email,
    displayName,
    accounts,
    refreshProfile,
    onLogout,
    theme,
    onToggleTheme,
    onPreviewChange,
}: {
    email: string;
    displayName: string;
    accounts: Account[];
    refreshProfile: () => Promise<void>;
    onLogout: () => void;
    theme: Theme;
    onToggleTheme: () => void;
    onPreviewChange: () => void;
}): ReactNode {
    const api: DataSource = useMemo((): DataSource => getServices().createDataSource(email), [email]);
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const [data, setData]: [Snapshot | null, Dispatch<SetStateAction<Snapshot | null>>] =
        useState<Snapshot | null>(null);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    async function refresh(): Promise<void> {
        try {
            // TODO: Tải dữ liệu theo từng nghiệp vụ qua Gateway thay cho Snapshot mock tổng hợp.
            setData(await api.read());
            setError("");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu.");
        }
    }
    useEffect((): (() => void) => {
        void refresh();
        const reload: () => void = (): void => {
            void refresh();
        };
        window.addEventListener("focus", reload);
        return (): void => window.removeEventListener("focus", reload);
    }, [api]);
    const unreadCount: number =
        data?.notifications.filter((notice: Notice): boolean => !notice.read).length ?? 0;
    return (
        <div>
            <header className="top">
                <Link className="brand" to="/" aria-label="LMS - Trang chủ">
                    <span className="brand-icon">
                        <BookOpen size={19} strokeWidth={2.2} />
                    </span>
                    <span className="brand-name">
                        lms<span>.</span>
                    </span>
                </Link>
                <span className="top-subtitle">Không gian học tập của bạn</span>
                <div className="top-right">
                    <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                    <Link
                        className="header-notification"
                        to="/notifications"
                        aria-label={`Thông báo: ${unreadCount} chưa đọc`}
                        title="Thông báo"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <strong className="header-notification-count">
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </strong>
                        )}
                    </Link>
                    <div className="header-account">
                        <span className="account-avatar" aria-hidden="true">
                            {displayName.charAt(0).toUpperCase()}
                        </span>
                        <div className="account-copy">
                            <strong>{displayName}</strong>
                            <small>{email}</small>
                        </div>
                    </div>
                    <button
                        className="icon-button logout-button"
                        aria-label="Đăng xuất"
                        title="Đăng xuất"
                        onClick={(): void => {
                            navigate("/login", { replace: true });
                            onLogout();
                        }}
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </header>
            <div className="layout">
                <aside className="sidebar">
                    <p className="eyebrow">KHÔNG GIAN CỦA BẠN</p>
                    <nav aria-label="Điều hướng chính">
                        <NavLink
                            end
                            to="/"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <Home size={19} /> <span>Trang chủ</span>
                        </NavLink>
                        <NavLink
                            to="/groups"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <Users size={19} /> <span>Nhóm học tập</span>
                        </NavLink>
                        <NavLink
                            to="/submissions"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <ClipboardList size={19} /> <span>Lịch sử bài nộp</span>
                        </NavLink>
                        <NavLink to="/favorites" className={({ isActive }): string => isActive ? "nav-link nav-active" : "nav-link"}>
                            <BookOpen size={19} /> <span>Đề yêu thích</span>
                        </NavLink>
                        <NavLink to="/profile" className={({ isActive }): string => isActive ? "nav-link nav-active" : "nav-link"}>
                            <Users size={19} /> <span>Hồ sơ</span>
                        </NavLink>
                        {getServices().accounts.isSystemAdmin(email) && (
                            <NavLink to="/admin" className={({ isActive }): string => isActive ? "nav-link nav-active" : "nav-link"}>
                                <Users size={19} /> <span>Quản trị hệ thống</span>
                            </NavLink>
                        )}
                    </nav>
                    <div className="sidebar-note">
                        <span className="sidebar-note-icon">
                            <BookOpen size={18} />
                        </span>
                        <div>
                            <strong>Mỗi ngày một chút</strong>
                            <span>Cùng nhau tiến bộ.</span>
                        </div>
                    </div>
                </aside>
                <main className="main">
                    {getServices().demo && (
                        <div className="demo">
                            <span className="demo-dot" />
                            <strong>BẢN TRẢI NGHIỆM</strong>
                            <span>{getServices().demo?.banner}</span>
                        </div>
                    )}
                    {getServices().rolePreview?.isEnabled(email) && (
                        <section className="role-preview" aria-label="Thử phân quyền">
                            <div>
                                <strong>Thử phân quyền · dữ liệu riêng</strong>
                                <p>Vai trò nhóm áp dụng cho nhóm riêng tư Cơ sở dữ liệu. Khách chưa đăng nhập có thể thử tại trang Khám phá.</p>
                            </div>
                            <label>
                                Vai trò thử nghiệm
                                <select value={getServices().rolePreview?.read()} onChange={(event): void => {
                                    getServices().rolePreview?.set(event.target.value);
                                    onPreviewChange();
                                }}>
                                    <option value="VISITOR">User chưa tham gia nhóm</option>
                                    <option value="MEMBER">Group Member</option>
                                    <option value="MODERATOR">Group Moderator</option>
                                    <option value="OWNER">Group Owner</option>
                                    <option value="SYSTEM_ADMIN">System Admin</option>
                                </select>
                            </label>
                            <button className="button" type="button" onClick={(): void => {
                                if (window.confirm("Đặt lại dữ liệu của khu vực thử phân quyền?")) {
                                    getServices().rolePreview?.reset();
                                    onPreviewChange();
                                }
                            }}>Đặt lại dữ liệu thử</button>
                        </section>
                    )}
                    {error && <p className="error">{error}</p>}
                    {data ? (
                        <Outlet context={{ data, api, refresh, accounts, displayName, refreshProfile, email } satisfies Context} />
                    ) : (
                        !error && <p>Đang tải dữ liệu…</p>
                    )}
                </main>
            </div>
        </div>
    );
}
