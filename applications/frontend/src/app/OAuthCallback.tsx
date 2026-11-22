import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { authApi, setAccessToken } from "../api/client";
import { consumeOAuthState, getOAuthRedirectUri } from "../api/oauth";
import type { AuthResponse, OAuthProvider } from "../api/types";
import { extractErrorMessage } from "../data/http/httpClient";

export function OAuthCallback({
    onAuthenticated
}: {
    onAuthenticated: () => Promise<void>;
}): ReactNode {
    const { provider: rawProvider }: { provider?: string } = useParams();
    const [searchParams]: [URLSearchParams, unknown] = useSearchParams();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const handledRef: { current: boolean } = useRef<boolean>(false);

    useEffect((): void => {
        if (handledRef.current) {
            return;
        }
        handledRef.current = true;

        const normalized: string = (rawProvider ?? "").toUpperCase();
        if (normalized !== "GOOGLE" && normalized !== "GITHUB") {
            setError("Unsupported OAuth provider.");
            return;
        }
        const provider: OAuthProvider = normalized;

        const oauthError: string | null = searchParams.get("error");
        if (oauthError) {
            setError(searchParams.get("error_description") ?? "OAuth authorization was cancelled.");
            return;
        }

        const code: string | null = searchParams.get("code");
        const state: string | null = searchParams.get("state");
        if (!code) {
            setError("Missing OAuth authorization code.");
            return;
        }
        if (!consumeOAuthState(provider, state)) {
            setError("OAuth state validation failed. Please sign in again.");
            return;
        }

        void (async (): Promise<void> => {
            try {
                const response: AuthResponse = await authApi.oauthLogin({
                    provider,
                    code,
                    redirect_uri: getOAuthRedirectUri(provider)
                });
                setAccessToken(response.token);
                await onAuthenticated();
                navigate("/", { replace: true });
            } catch (reason: unknown) {
                setError(extractErrorMessage(reason, "OAuth sign-in failed."));
            }
        })();
    }, [navigate, onAuthenticated, rawProvider, searchParams]);

    return (
        <main className="main oauth-callback-page page-enter">
            <section className="panel oauth-callback-card">
                <p className="eyebrow">SINGLE SIGN-ON</p>
                <h1>{error ? "Sign-in could not be completed" : "Completing sign-in..."}</h1>
                {error ? (
                    <>
                        <p className="error" role="alert">
                            {error}
                        </p>
                        <Link className="button primary" to="/login">
                            Return to sign in
                        </Link>
                    </>
                ) : (
                    <p className="muted">Verifying your account with the API Gateway.</p>
                )}
            </section>
        </main>
    );
}
