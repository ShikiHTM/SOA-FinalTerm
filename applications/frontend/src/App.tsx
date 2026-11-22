import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { dataSourceError, getServices } from "./data/services";
import { Dashboard } from "./features/dashboard/pages/DashboardPage";
import { Groups } from "./features/groups/pages/GroupsPage";
import { GroupDetail } from "./features/groups/pages/GroupDetailPage";
import { GroupSettingsPage } from "./features/groups/pages/GroupSettingsPage";
import { AssessmentEditor } from "./features/assessments/pages/AssessmentEditorPage";
import { AssessmentDetail } from "./features/assessments/pages/AssessmentDetailPage";
import { ContestDetail } from "./features/contests/pages/ContestDetailPage";
import { Attempt } from "./features/contests/pages/AttemptPage";
import { NewGroup } from "./features/groups/pages/CreateGroupPage";
import { NewContest } from "./features/contests/pages/CreateContestPage";
import { Practice } from "./features/assessments/pages/PracticePage";
import { Grading } from "./features/submissions/pages/GradingPage";
import { Notifications } from "./features/notifications/pages/NotificationsPage";
import { SubmissionHistory } from "./features/submissions/pages/SubmissionHistoryPage";
import { SubmissionDetail } from "./features/submissions/pages/SubmissionDetailPage";
import { GuestPage } from "./features/guest/pages/GuestPage";
import { AdminPage } from "./features/admin/pages/AdminPage";
import { FavoritesPage } from "./features/assessments/pages/FavoritesPage";
import { ProfilesPage } from "./features/profiles/pages/ProfilesPage";
import { Auth } from "./app/Auth";
import { Shell } from "./app/Shell";
import { ThemeToggle } from "./app/ThemeToggle";
import type { Theme } from "./app/theme";
import "./styles.css";

const THEME_KEY: string = "lms-theme";

function RequireSession({
    email,
    logoutRequested,
    children,
}: {
    email: string;
    logoutRequested: boolean;
    children: ReactNode;
}): ReactNode {
    const { pathname }: ReturnType<typeof useLocation> = useLocation();

    if (!email) {
        const destination: string = logoutRequested
            ? "/login"
            : pathname === "/"
              ? "/discover"
              : "/login";
        return <Navigate to={destination} replace />;
    }

    return children;
}


function Application(): ReactNode {
    const [previewRevision, setPreviewRevision]: [number, Dispatch<SetStateAction<number>>] = useState<number>(0);
    const [logoutRequested, setLogoutRequested]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [theme, setTheme]: [Theme, Dispatch<SetStateAction<Theme>>] = useState<Theme>(() => {
        try {
            return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
        } catch {
            return "light";
        }
    });
    useEffect((): void => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            // Theme vẫn áp dụng trong phiên hiện tại khi không lưu được.
        }
    }, [theme]);
    function toggleTheme(): void {
        setTheme((current: Theme): Theme => (current === "light" ? "dark" : "light"));
    }
    const [email, setEmail]: [string, Dispatch<SetStateAction<string>>] = useState<string>(() => {
        return getServices().session.read();
    });
    useEffect((): (() => void) => {
        const validate: () => void = (): void => {
            if (email) void getServices().accounts.isActive(email).then((active: boolean): void => {
                if (!active) {
                    getServices().session.clear();
                    setEmail("");
                }
            });
        };
        validate();
        window.addEventListener("focus", validate);
        window.addEventListener("storage", validate);
        return (): void => {
            window.removeEventListener("focus", validate);
            window.removeEventListener("storage", validate);
        };
    }, [email]);
    function login(value: string): void {
        getServices().session.save(value);
        setLogoutRequested(false);
        setEmail(value);
    }
    function logout(): void {
        setLogoutRequested(true);
        getServices().session.clear();
        setEmail("");
    }
    const guestPage: ReactNode = (
        <GuestPage themeControl={<ThemeToggle theme={theme} onToggle={toggleTheme} />} />
    );
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/discover" element={guestPage} />
                <Route path="/discover/groups/:groupId" element={guestPage} />
                <Route path="/discover/contests/:contestId" element={guestPage} />
                <Route path="/users" element={<ProfilesPage email={email} />} />
                <Route path="/users/:userEmail" element={<ProfilesPage email={email} />} />
                <Route
                    path="/login"
                    element={
                        email ? (
                            <Navigate to="/" replace />
                        ) : (
                            <Auth onLogin={login} theme={theme} onToggleTheme={toggleTheme} />
                        )
                    }
                />
                <Route path="/register" element={email ? <Navigate to="/" replace /> : <Auth key="register" register onLogin={login} theme={theme} onToggleTheme={toggleTheme} />} />
                <Route
                    element={
                        <RequireSession email={email} logoutRequested={logoutRequested}>
                            <Shell
                                key={`${email}:${previewRevision}`}
                                email={email}
                                onLogout={logout}
                                theme={theme}
                                onToggleTheme={toggleTheme}
                                onPreviewChange={(): void => setPreviewRevision((value: number): number => value + 1)}
                            />
                        </RequireSession>
                    }
                >
                    <Route index element={<Dashboard />} />
                    <Route path="groups" element={<Groups />} />
                    <Route path="groups/new" element={<NewGroup />} />
                    <Route path="groups/:groupId" element={<GroupDetail />} />
                    <Route path="groups/:groupId/settings" element={<GroupSettingsPage />} />
                    <Route path="assessments" element={<Navigate to="/groups" replace />} />
                    <Route path="assessments/new" element={<AssessmentEditor />} />
                    <Route path="assessments/:assessmentId/edit" element={<AssessmentEditor />} />
                    <Route path="assessments/:assessmentId" element={<AssessmentDetail />} />
                    <Route path="assessments/:assessmentId/practice" element={<Practice />} />
                    <Route path="contests" element={<Navigate to="/groups" replace />} />
                    <Route path="contests/new" element={<NewContest />} />
                    <Route path="contests/:contestId" element={<ContestDetail />} />
                    <Route path="contests/:contestId/attempt" element={<Attempt />} />
                    <Route path="grading" element={<Navigate to="/groups" replace />} />
                    <Route path="groups/:groupId/grading" element={<Grading />} />
                    <Route path="submissions" element={<SubmissionHistory />} />
                    <Route path="submissions/:submissionId" element={<SubmissionDetail />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="favorites" element={<FavoritesPage />} />
                    <Route path="profile" element={<ProfilesPage email={email} />} />
                    <Route path="admin" element={getServices().accounts.isSystemAdmin(email) ? <AdminPage /> : <Navigate to="/" replace />} />
                    <Route path="*" element={<p className="empty">Không tìm thấy trang.</p>} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
function App(): ReactNode {
    if (dataSourceError) {
        return (
            <main className="main">
                <section className="panel" role="alert">
                    <h1>Không thể khởi động nguồn dữ liệu</h1>
                    <p>{dataSourceError}</p>
                </section>
            </main>
        );
    }
    return <Application />;
}
export default App;
