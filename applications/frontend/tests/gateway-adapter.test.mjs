import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let HttpClient;
let HttpError;
let createNotificationAdapter;
let createGatewayServices;

before(async () => {
    vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
    ({ HttpClient, HttpError } = await vite.ssrLoadModule("/src/data/http/httpClient.ts"));
    ({ createNotificationAdapter } = await vite.ssrLoadModule("/src/data/gateway/notificationAdapter.ts"));
    ({ createGatewayServices } = await vite.ssrLoadModule("/src/data/gateway/services.ts"));
});

after(async () => {
    await vite?.close();
});

test("notification adapter forwards a configured Gateway request and propagates HTTP errors", async () => {
    const calls = [];
    const client = new HttpClient("https://example.test/api/v1", async (url, init) => {
        calls.push({ url: String(url), init });
        return calls.length === 1
            ? new Response(null, { status: 204 })
            : new Response('{"message":"denied"}', { status: 403 });
    });
    const adapter = createNotificationAdapter({
        client,
        markReadRequest: id => ({
            path: `example-notices/${encodeURIComponent(id)}`,
            init: { method: "PATCH", credentials: "include" },
        }),
    });
    await adapter.markRead("id/with space");
    assert.equal(calls[0].url, "https://example.test/api/v1/example-notices/id%2Fwith%20space");
    assert.equal(calls[0].init.method, "PATCH");
    assert.equal(calls[0].init.credentials, "include");
    await assert.rejects(() => adapter.markRead("denied"), error =>
        error instanceof HttpError && error.status === 403,
    );
});

test("Gateway services construct data adapters for the current user", async () => {
    const accounts = {};
    const session = {};
    const services = createGatewayServices({
        accounts,
        session,
        createDataSourceParts: email => ({
            read: async () => ({ email }),
            groups: {}, assessments: {}, contests: {}, submissions: {}, admin: {},
            notifications: { markRead: async id => `${email}:${id}` },
        }),
    });
    assert.equal(services.accounts, accounts);
    assert.equal(services.session, session);
    const api = services.createDataSource("user@example.test");
    assert.deepEqual(await api.read(), { email: "user@example.test" });
    assert.equal(await api.markRead("notice-1"), "user@example.test:notice-1");
});
