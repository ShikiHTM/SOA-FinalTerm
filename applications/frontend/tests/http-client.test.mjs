import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let createApiClient;
let HTTPError;
let extractErrorMessage;
let normalizeApiPrefix;

before(async () => {
    vite = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "silent"
    });
    ({ createApiClient, HTTPError, extractErrorMessage, normalizeApiPrefix } =
        await vite.ssrLoadModule("/src/data/http/httpClient.ts"));
});

after(async () => {
    await vite?.close();
});

test("preserves Gateway prefix, forwards searchParams & signal, and injects Bearer token", async () => {
    const controller = new AbortController();
    let capturedUrl = "";
    let capturedAuth = "";
    let hasSignal = false;

    const api = createApiClient({
        prefix: "https://example.test/api/v1/",
        getAccessToken: () => "jwt-token-123",
        fetch: async (request) => {
            capturedUrl = request.url;
            capturedAuth = request.headers.get("authorization") ?? "";
            hasSignal = request.signal instanceof AbortSignal && !request.signal.aborted;
            return new Response(JSON.stringify({ id: "group-1" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
    });

    const payload = await api
        .get("groups", { searchParams: { limit: 5 }, signal: controller.signal })
        .json();

    assert.deepEqual(payload, { id: "group-1" });
    assert.equal(capturedUrl, "https://example.test/api/v1/groups?limit=5");
    assert.equal(capturedAuth, "Bearer jwt-token-123");
    assert.equal(hasSignal, true);

    controller.abort("cancelled");
    await assert.rejects(() => api.get("groups", { signal: controller.signal }).json());
});

test("handles 204 No Content and formats Gateway error payloads", async () => {
    const okApi = createApiClient({
        prefix: "https://example.test/api/v1",
        fetch: async () => new Response(null, { status: 204 })
    });
    const noContentRes = await okApi.patch("notifications/1/read");
    assert.equal(noContentRes.status, 204);

    const jsonErrorApi = createApiClient({
        prefix: "https://example.test/api/v1",
        fetch: async () =>
            new Response(
                JSON.stringify({
                    message: "Validation failed.",
                    details: ["email: Invalid email address."]
                }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                }
            )
    });

    await assert.rejects(
        () => jsonErrorApi.post("auth/login", { json: {} }).json(),
        (error) =>
            error instanceof HTTPError &&
            error.response.status === 400 &&
            error.message === "Validation failed. email: Invalid email address." &&
            extractErrorMessage(error, "Fallback") ===
                "Validation failed. email: Invalid email address."
    );

    const textJsonErrorApi = createApiClient({
        prefix: "https://example.test/api/v1",
        fetch: async () =>
            new Response(JSON.stringify({ message: "Access denied" }), {
                status: 403,
                headers: { "Content-Type": "text/plain" }
            })
    });

    await assert.rejects(
        () => textJsonErrorApi.get("groups/private").json(),
        (error) =>
            error instanceof HTTPError &&
            error.response.status === 403 &&
            error.message === "Access denied" &&
            extractErrorMessage(error, "Fallback") === "Access denied"
    );
});

test("rejects invalid prefix URLs and blocks path traversal before calling fetch", async () => {
    assert.equal(normalizeApiPrefix("/api/v1/"), "/api/v1");
    assert.equal(normalizeApiPrefix("https://example.test/api/v1/"), "https://example.test/api/v1");

    assert.throws(() => normalizeApiPrefix(""), /Invalid API Gateway URL/);
    assert.throws(() => normalizeApiPrefix("ftp://example.test/api"), /Invalid API Gateway URL/);
    assert.throws(
        () => normalizeApiPrefix("https://user:pass@example.test/api"),
        /Invalid API Gateway URL/
    );
    assert.throws(
        () => normalizeApiPrefix("https://example.test/api?x=1"),
        /Invalid API Gateway URL/
    );
    assert.throws(() => normalizeApiPrefix("//other.test/api"), /Invalid API Gateway URL/);

    let calls = 0;
    const api = createApiClient({
        prefix: "https://example.test/api/v1",
        fetch: async () => {
            calls += 1;
            return new Response(null, { status: 200 });
        }
    });

    await assert.rejects(() => api.get("../other"), /escapes the configured Gateway/);
    assert.equal(calls, 0);
});

test("formats browser network errors via extractErrorMessage", () => {
    assert.equal(
        extractErrorMessage(new TypeError("Failed to fetch"), "Fallback"),
        "Unable to reach the API Gateway. Please check that the server is running."
    );
    assert.equal(
        extractErrorMessage(new Error("Custom error"), "Fallback"),
        "Custom error"
    );
    assert.equal(extractErrorMessage("unknown", "Fallback"), "Fallback");
});
