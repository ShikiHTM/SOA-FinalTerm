import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let oauth;

before(async () => {
    vite = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "silent"
    });
    oauth = await vite.ssrLoadModule("/src/api/oauth.ts");
});

after(async () => {
    await vite?.close();
});

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key)
    };
}

test("builds callback redirect URIs per OAuth provider", () => {
    const { getOAuthRedirectUri } = oauth;
    assert.equal(
        getOAuthRedirectUri("GOOGLE", "http://localhost:5173/"),
        "http://localhost:5173/auth/callback/google"
    );
    assert.equal(
        getOAuthRedirectUri("GITHUB", "https://example.edu"),
        "https://example.edu/auth/callback/github"
    );
});

test("builds Google and GitHub authorization URLs and persists CSRF state", () => {
    const { createOAuthAuthorizationUrl } = oauth;
    const storage = createMemoryStorage();

    const googleRaw = createOAuthAuthorizationUrl("GOOGLE", {
        clientId: "google-client-123",
        origin: "http://localhost:5173",
        storage,
        state: "state-google-1"
    });
    const googleUrl = new URL(googleRaw);
    assert.equal(googleUrl.origin, "https://accounts.google.com");
    assert.equal(googleUrl.pathname, "/o/oauth2/v2/auth");
    assert.equal(googleUrl.searchParams.get("client_id"), "google-client-123");
    assert.equal(
        googleUrl.searchParams.get("redirect_uri"),
        "http://localhost:5173/auth/callback/google"
    );
    assert.equal(googleUrl.searchParams.get("scope"), "openid email profile");
    assert.equal(googleUrl.searchParams.get("state"), "state-google-1");
    assert.equal(storage.getItem("lms-oauth-state:GOOGLE"), "state-google-1");

    const githubRaw = createOAuthAuthorizationUrl("GITHUB", {
        clientId: "github-client-456",
        origin: "http://localhost:5173",
        storage,
        state: "state-github-2"
    });
    const githubUrl = new URL(githubRaw);
    assert.equal(githubUrl.origin, "https://github.com");
    assert.equal(githubUrl.pathname, "/login/oauth/authorize");
    assert.equal(githubUrl.searchParams.get("client_id"), "github-client-456");
    assert.equal(
        githubUrl.searchParams.get("redirect_uri"),
        "http://localhost:5173/auth/callback/github"
    );
    assert.equal(githubUrl.searchParams.get("scope"), "read:user user:email");
    assert.equal(githubUrl.searchParams.get("state"), "state-github-2");
    assert.equal(storage.getItem("lms-oauth-state:GITHUB"), "state-github-2");
});

test("throws an explicit error when an OAuth client ID is missing", () => {
    const { createOAuthAuthorizationUrl } = oauth;
    assert.throws(
        () => createOAuthAuthorizationUrl("GOOGLE", { clientId: "", storage: null }),
        /Google OAuth2 client ID is not configured\./
    );
    assert.throws(
        () => createOAuthAuthorizationUrl("GITHUB", { clientId: "", storage: null }),
        /GitHub OAuth2 client ID is not configured\./
    );
});

test("consumes OAuth state once and rejects mismatches or replays", () => {
    const { createOAuthAuthorizationUrl, consumeOAuthState } = oauth;
    const storage = createMemoryStorage();

    createOAuthAuthorizationUrl("GOOGLE", {
        clientId: "google-client-123",
        origin: "http://localhost:5173",
        storage,
        state: "one-time-state"
    });

    assert.equal(consumeOAuthState("GOOGLE", "wrong-state", storage), false);
    assert.equal(consumeOAuthState("GOOGLE", "one-time-state", storage), false);

    createOAuthAuthorizationUrl("GITHUB", {
        clientId: "github-client-456",
        origin: "http://localhost:5173",
        storage,
        state: "valid-state"
    });

    assert.equal(consumeOAuthState("GITHUB", "valid-state", storage), true);
    assert.equal(consumeOAuthState("GITHUB", "valid-state", storage), false);
});

test("resolves OAuth client IDs from explicit envSource and runtime window config", () => {
    const { getOAuthClientId } = oauth;

    assert.equal(
        getOAuthClientId("GOOGLE", { VITE_GOOGLE_CLIENT_ID: "  google-id-trimmed  " }),
        "google-id-trimmed"
    );
    assert.equal(
        getOAuthClientId("GITHUB", { VITE_GITHUB_CLIENT_ID: "  github-id-trimmed  " }),
        "github-id-trimmed"
    );
    assert.equal(getOAuthClientId("GITHUB", {}), "");

    const hadWindow = Object.hasOwn(globalThis, "window");
    const previousWindow = globalThis.window;
    globalThis.window = {
        __APP_CONFIG__: {
            VITE_GOOGLE_CLIENT_ID: "runtime-google-id",
            VITE_GITHUB_CLIENT_ID: "runtime-github-id"
        }
    };
    try {
        assert.equal(getOAuthClientId("GOOGLE"), "runtime-google-id");
        assert.equal(getOAuthClientId("GITHUB"), "runtime-github-id");
    } finally {
        if (hadWindow) {
            globalThis.window = previousWindow;
        } else {
            delete globalThis.window;
        }
    }
});
