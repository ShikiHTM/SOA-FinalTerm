import { useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { getServices } from "../data/services";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";

export function Auth({
    onLogin,
    theme,
    onToggleTheme,
    register = false,
}: {
    onLogin: (email: string) => void;
    theme: Theme;
    onToggleTheme: () => void;
    register?: boolean;
}): ReactNode {
    const demo: ReturnType<typeof getServices>["demo"] = getServices().demo;
    const [email, setEmail]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    async function login(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            // TODO: Kết nối đăng nhập, đăng ký và phiên thật theo contract xác thực của Gateway.
            if (register) await getServices().accounts.register(email, password);
            onLogin(await getServices().accounts.authenticate(email, password));
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể xác thực tài khoản.");
        }
    }
    return (
        <main className="login">
            <div className="login-header">
                <div className="brand">
                    <span className="brand-icon">L</span> LMS
                </div>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <div className="login-grid">
                <section>
                    <p className="eyebrow">KHÔNG GIAN HỌC TẬP</p>
                    <h1>
                        Học cùng nhau.
                        <br />
                        Tiến bộ mỗi ngày.
                    </h1>
                    <p className="muted">Một nơi để khám phá nhóm, luyện tập và tham gia kỳ thi.</p>
                </section>
                <section className="panel login-panel">
                    <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
                    <h2>
                        {register ? "Đăng ký" : "Đăng nhập"}
                        {demo ? " trải nghiệm" : ""}
                    </h2>
                    {demo && <p className="notice">{demo.authNotice}</p>}
                    {demo && <p className="hint auth-preview-hint">{demo.roleHint}</p>}
                    <form
                        className="form"
                        onSubmit={(event): void => {
                            void login(event);
                        }}
                    >
                        <label>
                            Email
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(event): void => setEmail(event.target.value)}
                            />
                        </label>
                        <label>
                            {demo ? "Mật khẩu thử nghiệm" : "Mật khẩu"}
                            <input
                                type="password"
                                minLength={6}
                                required
                                value={password}
                                onChange={(event): void => setPassword(event.target.value)}
                            />
                        </label>
                        {error && (
                            <p className="error" role="alert">
                                {error}
                            </p>
                        )}
                        <button className="button primary">Tiếp tục</button>
                    </form>
                    {/* TODO: Tích hợp chuyển hướng và callback OAuth sau khi có contract Google/GitHub. */}
                    <div className="auth-providers" aria-label="Phương thức đăng nhập khác">
                        <div className="auth-providers-divider">
                            <span>hoặc tiếp tục với</span>
                        </div>
                        <div className="auth-providers-buttons">
                            <button
                                className="button auth-provider"
                                type="button"
                                disabled
                                aria-describedby="auth-providers-status"
                            >
                                <span className="auth-provider-icon" aria-hidden="true">G</span>
                                Google
                            </button>
                            <button
                                className="button auth-provider"
                                type="button"
                                disabled
                                aria-describedby="auth-providers-status"
                            >
                                <span className="auth-provider-icon" aria-hidden="true">GH</span>
                                GitHub
                            </button>
                        </div>
                        <p id="auth-providers-status" className="auth-providers-status">
                            Đăng nhập Google và GitHub chưa được kết nối.
                        </p>
                    </div>
                    <p className="auth-switch">
                        {register ? (
                            <Link to="/login">Đã có tài khoản? Đăng nhập</Link>
                        ) : (
                            <Link to="/register">
                                Chưa có tài khoản? {demo ? "Đăng ký thử nghiệm" : "Đăng ký"}
                            </Link>
                        )}
                    </p>
                    <Link className="auth-guest-link" to="/discover">
                        Khám phá với tư cách khách
                    </Link>
                </section>
            </div>
        </main>
    );
}
