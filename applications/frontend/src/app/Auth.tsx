import { useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { authApi, setAccessToken } from "../api/client";
import { createOAuthAuthorizationUrl } from "../api/oauth";
import type { AuthResponse, OAuthProvider } from "../api/types";
import { extractErrorMessage } from "../data/http/httpClient";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";

function GoogleIcon(): ReactNode {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
                fill="currentColor"
                d="M21.35 11.1H12v3.2h5.35c-.45 2.4-2.55 4-5.35 4a6 6 0 1 1 3.95-10.5l2.45-2.45A9.4 9.4 0 0 0 12 2.6a9.4 9.4 0 1 0 0 18.8c5.4 0 9-3.8 9-9.15 0-.4-.05-.8-.15-1.15Z"
            />
        </svg>
    );
}

function GitHubIcon(): ReactNode {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
            />
        </svg>
    );
}

export function Auth({
    onAuthenticated,
    theme,
    onToggleTheme,
    register = false
}: {
    onAuthenticated: () => Promise<void>;
    theme: Theme;
    onToggleTheme: () => void;
    register?: boolean;
}): ReactNode {
    const [identifier, setIdentifier]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [email, setEmail]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [username, setUsername]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [displayName, setDisplayName]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const [oauthBusy, setOauthBusy]: [OAuthProvider | null, Dispatch<SetStateAction<OAuthProvider | null>>] =
        useState<OAuthProvider | null>(null);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            const response: AuthResponse = register
                ? await authApi.register({
                      email: email.trim(),
                      username: username.trim(),
                      password,
                      display_name: displayName.trim()
                  })
                : await authApi.login(identifier.trim(), password);
            setAccessToken(response.token);
            await onAuthenticated();
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to authenticate account."));
        } finally {
            setBusy(false);
        }
    }

    function launchOAuth(provider: OAuthProvider): void {
        setError("");
        try {
            setOauthBusy(provider);
            const authUrl: string = createOAuthAuthorizationUrl(provider);
            window.location.assign(authUrl);
        } catch (reason: unknown) {
            setOauthBusy(null);
            setError(extractErrorMessage(reason, "Unable to start OAuth sign-in."));
        }
    }

    return (
        <main className="login page-enter">
            <div className="login-header">
                <Link className="brand" to="/discover">
                    <span className="brand-icon">L</span> LMS
                </Link>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <div className="login-grid">
                <section>
                    <p className="eyebrow">LEARNING WORKSPACE</p>
                    <h1>
                        Learn together.
                        <br />
                        Grow every day.
                    </h1>
                    <p className="muted">
                        Join learning groups, compete in scheduled contests, and track your
                        progress over time.
                    </p>
                </section>
                <section className="panel login-panel">
                    <p className="eyebrow">{register ? "CREATE ACCOUNT" : "WELCOME BACK"}</p>
                    <h2>{register ? "Sign up" : "Sign in"}</h2>
                    <form
                        className="form"
                        onSubmit={(event): void => {
                            void submit(event);
                        }}
                    >
                        {register ? (
                            <>
                                <label>
                                    Display name
                                    <input
                                        type="text"
                                        required
                                        maxLength={120}
                                        value={displayName}
                                        onChange={(event): void => setDisplayName(event.target.value)}
                                    />
                                </label>
                                <label>
                                    Username
                                    <input
                                        type="text"
                                        required
                                        minLength={3}
                                        maxLength={64}
                                        pattern="[a-zA-Z0-9_.-]+"
                                        title="Letters, numbers, dots, underscores, and hyphens only"
                                        value={username}
                                        onChange={(event): void => setUsername(event.target.value)}
                                    />
                                </label>
                                <label>
                                    Email
                                    <input
                                        type="email"
                                        required
                                        maxLength={255}
                                        value={email}
                                        onChange={(event): void => setEmail(event.target.value)}
                                    />
                                </label>
                            </>
                        ) : (
                            <label>
                                Email or username
                                <input
                                    type="text"
                                    required
                                    maxLength={255}
                                    value={identifier}
                                    onChange={(event): void => setIdentifier(event.target.value)}
                                />
                            </label>
                        )}
                        <label>
                            Password
                            <input
                                type="password"
                                minLength={register ? 8 : 1}
                                maxLength={128}
                                required
                                value={password}
                                onChange={(event): void => setPassword(event.target.value)}
                            />
                        </label>
                        {register && (
                            <p className="hint">
                                Minimum 8 characters including uppercase, lowercase, and a digit.
                            </p>
                        )}
                        {error && (
                            <p className="error" role="alert">
                                {error}
                            </p>
                        )}
                        <button className="button primary" disabled={busy || oauthBusy !== null}>
                            {busy ? "Please wait..." : register ? "Create account" : "Continue"}
                        </button>
                    </form>
                    <div className="auth-providers" aria-label="Alternative sign-in methods">
                        <div className="auth-providers-divider">
                            <span>or continue with</span>
                        </div>
                        <div className="auth-providers-buttons">
                            <button
                                className="button auth-provider"
                                type="button"
                                disabled={busy || oauthBusy !== null}
                                onClick={(): void => launchOAuth("GOOGLE")}
                            >
                                <GoogleIcon />
                                <span>{oauthBusy === "GOOGLE" ? "Redirecting..." : "Google"}</span>
                            </button>
                            <button
                                className="button auth-provider"
                                type="button"
                                disabled={busy || oauthBusy !== null}
                                onClick={(): void => launchOAuth("GITHUB")}
                            >
                                <GitHubIcon />
                                <span>{oauthBusy === "GITHUB" ? "Redirecting..." : "GitHub"}</span>
                            </button>
                        </div>
                    </div>
                    <p className="auth-switch">
                        {register ? (
                            <Link to="/login">Already have an account? Sign in</Link>
                        ) : (
                            <Link to="/register">Need an account? Sign up</Link>
                        )}
                    </p>
                    <Link className="auth-guest-link" to="/discover">
                        Browse as guest
                    </Link>
                </section>
            </div>
        </main>
    );
}
