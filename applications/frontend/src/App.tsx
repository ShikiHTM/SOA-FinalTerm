import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { authApi, clearAccessToken, getAccessToken, usersApi } from "./api/client";
import type { OwnUserProfile } from "./api/types";
import { Auth } from "./app/Auth";
import { OAuthCallback } from "./app/OAuthCallback";
import { Shell } from "./app/Shell";
import { ThemeToggle } from "./app/ThemeToggle";
import type { Theme } from "./app/theme";
import { HTTPError } from "./data/http/httpClient";
import { AdminPage } from "./features/admin/pages/AdminPage";
import { AssessmentDetail } from "./features/assessments/pages/AssessmentDetailPage";
import { AssessmentEditor } from "./features/assessments/pages/AssessmentEditorPage";
import { FavoritesPage } from "./features/assessments/pages/FavoritesPage";
import { Practice } from "./features/assessments/pages/PracticePage";
import { Attempt } from "./features/contests/pages/AttemptPage";
import { ContestDetail } from "./features/contests/pages/ContestDetailPage";
import { Contests } from "./features/contests/pages/ContestsPage";
import { NewContest } from "./features/contests/pages/CreateContestPage";
import { Dashboard } from "./features/dashboard/pages/DashboardPage";
import { NewGroup } from "./features/groups/pages/CreateGroupPage";
import { GroupDetail } from "./features/groups/pages/GroupDetailPage";
import { GroupSettingsPage } from "./features/groups/pages/GroupSettingsPage";
import { Groups } from "./features/groups/pages/GroupsPage";
import { GuestPage } from "./features/guest/pages/GuestPage";
import { Notifications } from "./features/notifications/pages/NotificationsPage";
import { ProfilesPage } from "./features/profiles/pages/ProfilesPage";
import { Grading } from "./features/submissions/pages/GradingPage";
import { SubmissionDetail } from "./features/submissions/pages/SubmissionDetailPage";
import { SubmissionHistory } from "./features/submissions/pages/SubmissionHistoryPage";
import "./styles.css";

const THEME_KEY: string = "lms-theme";

function RequireSession({
    user,
    booting,
    logoutRequested,
    children
}: {
    user: OwnUserProfile | null;
    booting: boolean;
    logoutRequested: boolean;
    children: ReactNode;
}): ReactNode {
    const { pathname }: ReturnType<typeof useLocation> = useLocation();

    if (booting) {
        return (
            <main className="main">
                <section className="panel" aria-busy="true">
                    <div className="skeleton-block" />
                    <div className="skeleton-block" />
                </section>
            </main>
        );
    }

    if (!user) {
        const destination: string = logoutRequested
            ? "/login"
            : pathname === "/"
              ? "/discover"
              : "/login";
        return <Navigate to={destination} replace />;
    }

    return children;
}

function GuestProfileWrapper(): ReactNode {
    return <Outlet />;
}

export function Application(): ReactNode {
    const [user, setUser]: [OwnUserProfile | null, Dispatch<SetStateAction<OwnUserProfile | null>>] =
        useState<OwnUserProfile | null>(null);
    const [booting, setBooting]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(
        (): boolean => Boolean(getAccessToken())
    );
    const [logoutRequested, setLogoutRequested]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [theme, setTheme]: [Theme, Dispatch<SetStateAction<Theme>>] = useState<Theme>((): Theme => {
        if (typeof window === "undefined") {
            return "light";
        }
        return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    });

    useEffect((): void => {
        document.documentElement.setAttribute("data-theme", theme);
        window.localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    const toggleTheme: () => void = useCallback((): void => {
        setTheme((current: Theme): Theme => (current === "light" ? "dark" : "light"));
    }, []);

    const refreshUser: () => Promise<void> = useCallback(async (): Promise<void> => {
        const token: string = getAccessToken();
        if (!token) {
            setUser(null);
            return;
        }
        try {
            const me: OwnUserProfile = await usersApi.getMe();
            setLogoutRequested(false);
            setUser(me);
        } catch (err: unknown) {
            if (err instanceof HTTPError && (err.response.status === 401 || err.response.status === 403)) {
                clearAccessToken();
            }
            setUser(null);
            throw err;
        }
    }, []);

    useEffect((): (() => void) | undefined => {
        let cancelled: boolean = false;
        const token: string = getAccessToken();
        if (!token) {
            setBooting(false);
            return undefined;
        }

        usersApi
            .getMe()
            .then((me: OwnUserProfile): void => {
                if (!cancelled) {
                    setUser(me);
                }
            })
            .catch((err: unknown): void => {
                if (err instanceof HTTPError && (err.response.status === 401 || err.response.status === 403)) {
                    clearAccessToken();
                }
                if (!cancelled) {
                    setUser(null);
                }
            })
            .finally((): void => {
                if (!cancelled) {
                    setBooting(false);
                }
            });

        return (): void => {
            cancelled = true;
        };
    }, []);

    const handleAuthenticated: () => Promise<void> = useCallback(async (): Promise<void> => {
        await refreshUser();
    }, [refreshUser]);

    const handleLogout: () => Promise<void> = useCallback(async (): Promise<void> => {
        setLogoutRequested(true);
        try {
            await authApi.logout();
        } catch {
            clearAccessToken();
        } finally {
            clearAccessToken();
            setUser(null);
        }
    }, []);

    const themeControl: ReactNode = <ThemeToggle theme={theme} onToggle={toggleTheme} />;

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/discover" element={<GuestPage themeControl={themeControl} />} />
                <Route
                    path="/discover/groups/:groupId"
                    element={<GuestPage themeControl={themeControl} />}
                />
                <Route
                    path="/discover/contests/:contestId"
                    element={<GuestPage themeControl={themeControl} />}
                />
                <Route
                    path="/login"
                    element={
                        user ? (
                            <Navigate to="/" replace />
                        ) : (
                            <Auth
                                onAuthenticated={handleAuthenticated}
                                theme={theme}
                                onToggleTheme={toggleTheme}
                            />
                        )
                    }
                />
                <Route
                    path="/register"
                    element={
                        user ? (
                            <Navigate to="/" replace />
                        ) : (
                            <Auth
                                key="register"
                                register
                                onAuthenticated={handleAuthenticated}
                                theme={theme}
                                onToggleTheme={toggleTheme}
                            />
                        )
                    }
                />
                <Route
                    path="/auth/callback/:provider"
                    element={<OAuthCallback onAuthenticated={handleAuthenticated} />}
                />

                <Route
                    element={
                        user ? (
                            <Shell
                                user={user}
                                refreshUser={refreshUser}
                                onLogout={handleLogout}
                                theme={theme}
                                onToggleTheme={toggleTheme}
                            />
                        ) : (
                            <GuestProfileWrapper />
                        )
                    }
                >
                    <Route
                        path="/users/:username"
                        element={
                            <ProfilesPage
                                currentUser={user}
                                onProfileUpdated={refreshUser}
                                themeControl={user ? undefined : themeControl}
                            />
                        }
                    />
                    <Route
                        path="/users/id/:userId"
                        element={
                            <ProfilesPage
                                currentUser={user}
                                onProfileUpdated={refreshUser}
                                themeControl={user ? undefined : themeControl}
                            />
                        }
                    />
                </Route>

                <Route
                    element={
                        <RequireSession
                            user={user}
                            booting={booting}
                            logoutRequested={logoutRequested}
                        >
                            {user ? (
                                <Shell
                                    user={user}
                                    refreshUser={refreshUser}
                                    onLogout={handleLogout}
                                    theme={theme}
                                    onToggleTheme={toggleTheme}
                                />
                            ) : null}
                        </RequireSession>
                    }
                >
                    <Route index element={<Dashboard />} />
                    <Route path="groups" element={<Groups />} />
                    <Route path="groups/new" element={<NewGroup />} />
                    <Route path="groups/:groupId" element={<GroupDetail />} />
                    <Route path="groups/:groupId/settings" element={<GroupSettingsPage />} />
                    <Route path="groups/:groupId/grading" element={<Grading />} />
                    <Route path="assessments" element={<Navigate to="/groups" replace />} />
                    <Route path="assessments/new" element={<AssessmentEditor />} />
                    <Route path="assessments/:assessmentId/edit" element={<AssessmentEditor />} />
                    <Route path="assessments/:assessmentId" element={<AssessmentDetail />} />
                    <Route path="assessments/:assessmentId/practice" element={<Practice />} />
                    <Route path="contests" element={<Contests />} />
                    <Route path="contests/new" element={<NewContest />} />
                    <Route path="contests/:contestId" element={<ContestDetail />} />
                    <Route path="contests/:contestId/attempt" element={<Attempt />} />
                    <Route path="grading" element={<Navigate to="/groups" replace />} />
                    <Route path="submissions" element={<SubmissionHistory />} />
                    <Route path="submissions/:submissionId" element={<SubmissionDetail />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="favorites" element={<FavoritesPage />} />
                    <Route
                        path="profile"
                        element={
                            <ProfilesPage currentUser={user} onProfileUpdated={refreshUser} />
                        }
                    />
                    <Route
                        path="admin"
                        element={
                            user?.system_role === "ADMIN" ? (
                                <AdminPage />
                            ) : (
                                <Navigate to="/" replace />
                            )
                        }
                    />
                    <Route path="*" element={<p className="empty">Page not found.</p>} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default Application;
