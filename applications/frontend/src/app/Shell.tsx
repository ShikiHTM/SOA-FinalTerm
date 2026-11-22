import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
    Bell,
    BookOpen,
    ClipboardList,
    GraduationCap,
    Heart,
    Home,
    LogOut,
    ShieldCheck,
    User,
    Users
} from "lucide-react";
import { notificationsApi } from "../api/client";
import type { NotificationItem, OwnUserProfile } from "../api/types";
import type { AppContext } from "../shared/context";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";

export function Shell({
    user,
    refreshUser,
    onLogout,
    theme,
    onToggleTheme
}: {
    user: OwnUserProfile;
    refreshUser: () => Promise<void>;
    onLogout: () => Promise<void>;
    theme: Theme;
    onToggleTheme: () => void;
}): ReactNode {
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const [unreadCount, setUnreadCount]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(0);

    const refreshNotifications: () => Promise<void> = useCallback(async (): Promise<void> => {
        try {
            const unread: NotificationItem[] = await notificationsApi.list({
                unread_only: true,
                limit: 100
            });
            setUnreadCount(unread.length);
        } catch {
            return;
        }
    }, []);

    useEffect((): (() => void) => {
        void refreshNotifications();
        const handleFocus: () => void = (): void => {
            void refreshNotifications();
        };
        window.addEventListener("focus", handleFocus);
        return (): void => window.removeEventListener("focus", handleFocus);
    }, [refreshNotifications]);

    return (
        <div>
            <header className="top">
                <Link className="brand" to="/" aria-label="LMS - Home">
                    <span className="brand-icon">
                        <BookOpen size={19} strokeWidth={2.2} />
                    </span>
                    <span className="brand-name">
                        lms<span>.</span>
                    </span>
                </Link>
                <span className="top-subtitle">Learning Workspace</span>
                <div className="top-right">
                    <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                    <Link
                        className="header-notification"
                        to="/notifications"
                        aria-label={`Notifications: ${unreadCount} unread`}
                        title="Notifications"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <strong className="header-notification-count">
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </strong>
                        )}
                    </Link>
                    <Link className="header-account" to="/profile">
                        {user.avatar_url ? (
                            <img
                                className="account-avatar-img"
                                src={user.avatar_url}
                                alt={user.display_name}
                            />
                        ) : (
                            <span className="account-avatar" aria-hidden="true">
                                {user.display_name.charAt(0).toUpperCase()}
                            </span>
                        )}
                        <div className="account-copy">
                            <strong>{user.display_name}</strong>
                            <small>@{user.username}</small>
                        </div>
                    </Link>
                    <button
                        className="icon-button logout-button"
                        type="button"
                        aria-label="Sign out"
                        title="Sign out"
                        onClick={(): void => {
                            void onLogout().then((): void => {
                                navigate("/login", { replace: true });
                            });
                        }}
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </header>
            <div className="layout">
                <aside className="sidebar">
                    <p className="eyebrow">WORKSPACE</p>
                    <nav aria-label="Primary navigation">
                        <NavLink
                            end
                            to="/"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <Home size={19} /> <span>Home</span>
                        </NavLink>
                        <NavLink
                            to="/groups"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <Users size={19} /> <span>Groups</span>
                        </NavLink>
                        <NavLink
                            to="/contests"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <GraduationCap size={19} /> <span>Contests</span>
                        </NavLink>
                        <NavLink
                            to="/submissions"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <ClipboardList size={19} /> <span>Submissions</span>
                        </NavLink>
                        <NavLink
                            to="/favorites"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <Heart size={19} /> <span>Favorites</span>
                        </NavLink>
                        <NavLink
                            to="/profile"
                            className={({ isActive }): string =>
                                isActive ? "nav-link nav-active" : "nav-link"
                            }
                        >
                            <User size={19} /> <span>Profile</span>
                        </NavLink>
                        {user.system_role === "ADMIN" && (
                            <NavLink
                                to="/admin"
                                className={({ isActive }): string =>
                                    isActive ? "nav-link nav-active" : "nav-link"
                                }
                            >
                                <ShieldCheck size={19} /> <span>Admin</span>
                            </NavLink>
                        )}
                    </nav>
                    <div className="sidebar-note">
                        <span className="sidebar-note-icon">
                            <BookOpen size={18} />
                        </span>
                        <div>
                            <strong>Step by step</strong>
                            <span>Build mastery every day.</span>
                        </div>
                    </div>
                </aside>
                <main className="main">
                    <Outlet
                        context={
                            {
                                user,
                                unreadCount,
                                refreshUser,
                                refreshNotifications,
                                onLogout
                            } satisfies AppContext
                        }
                    />
                </main>
            </div>
        </div>
    );
}
