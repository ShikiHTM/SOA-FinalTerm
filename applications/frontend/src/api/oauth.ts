import type { OAuthProvider } from "./types";

export interface StorageAdapter {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

type RuntimeAppConfig = {
    VITE_API_BASE_URL?: string;
    VITE_GOOGLE_CLIENT_ID?: string;
    VITE_GITHUB_CLIENT_ID?: string;
};

const OAUTH_STATE_PREFIX: string = "lms-oauth-state:";

function getRuntimeConfig(): RuntimeAppConfig {
    if (typeof window === "undefined") {
        return {};
    }
    const candidate: unknown = (window as Window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
    if (typeof candidate === "object" && candidate !== null) {
        return candidate as RuntimeAppConfig;
    }
    return {};
}

export function getOAuthClientId(
    provider: OAuthProvider,
    envSource?: Record<string, string | undefined>
): string {
    if (envSource !== undefined) {
        const fromSource: string | undefined =
            provider === "GOOGLE"
                ? envSource.VITE_GOOGLE_CLIENT_ID
                : envSource.VITE_GITHUB_CLIENT_ID;
        return typeof fromSource === "string" ? fromSource.trim() : "";
    }
    const runtimeConfig: RuntimeAppConfig = getRuntimeConfig();
    const fromRuntime: string | undefined =
        provider === "GOOGLE"
            ? runtimeConfig.VITE_GOOGLE_CLIENT_ID
            : runtimeConfig.VITE_GITHUB_CLIENT_ID;
    if (typeof fromRuntime === "string" && fromRuntime.trim().length > 0) {
        return fromRuntime.trim();
    }
    const fromEnv: unknown =
        provider === "GOOGLE"
            ? import.meta.env.VITE_GOOGLE_CLIENT_ID
            : import.meta.env.VITE_GITHUB_CLIENT_ID;
    return typeof fromEnv === "string" ? fromEnv.trim() : "";
}

export function getOAuthRedirectUri(
    provider: OAuthProvider,
    origin: string = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173"
): string {
    const normalizedOrigin: string = origin.replace(/\/+$/, "");
    return `${normalizedOrigin}/auth/callback/${provider.toLowerCase()}`;
}

export function createOAuthAuthorizationUrl(
    provider: OAuthProvider,
    options?: {
        clientId?: string;
        origin?: string;
        storage?: StorageAdapter | null;
        state?: string;
    }
): string {
    const clientId: string = options?.clientId ?? getOAuthClientId(provider);
    if (!clientId) {
        throw new Error(
            `${provider === "GOOGLE" ? "Google" : "GitHub"} OAuth2 client ID is not configured.`
        );
    }
    const state: string = options?.state ?? crypto.randomUUID();
    const storage: StorageAdapter | null =
        options?.storage !== undefined
            ? options.storage
            : typeof sessionStorage !== "undefined"
              ? sessionStorage
              : null;
    if (storage) {
        storage.setItem(`${OAUTH_STATE_PREFIX}${provider}`, state);
    }

    const redirectUri: string = getOAuthRedirectUri(provider, options?.origin);
    if (provider === "GOOGLE") {
        const params: URLSearchParams = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "openid email profile",
            state,
            prompt: "select_account"
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    const params: URLSearchParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function consumeOAuthState(
    provider: OAuthProvider,
    receivedState: string | null,
    storage: StorageAdapter | null = typeof sessionStorage !== "undefined" ? sessionStorage : null
): boolean {
    const storageKey: string = `${OAUTH_STATE_PREFIX}${provider}`;
    if (!storage) {
        return false;
    }
    const expectedState: string | null = storage.getItem(storageKey);
    storage.removeItem(storageKey);
    if (!expectedState || !receivedState) {
        return false;
    }
    return expectedState === receivedState;
}
