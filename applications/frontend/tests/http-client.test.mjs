import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let HttpClient;
let HttpError;

before(async () => {
    vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
    ({ HttpClient, HttpError } = await vite.ssrLoadModule("/src/data/http/httpClient.ts"));
});

after(async () => {
    await vite?.close();
});

test("preserves the Gateway base path and forwards request options", async () => {
    const controller = new AbortController();
    let captured;
    const client = new HttpClient("https://example.test/api/v1", async (url, init) => {
        captured = { url: String(url), init };
        return new Response(JSON.stringify({ id: "group-1" }), { status: 200 });
    });
    assert.deepEqual(await client.requestJson("groups?limit=5", { signal: controller.signal }), { id: "group-1" });
    assert.equal(captured.url, "https://example.test/api/v1/groups?limit=5");
    assert.equal(captured.init.signal, controller.signal);
});

test("handles empty responses and preserves server errors", async () => {
    const empty = new HttpClient("https://example.test/", async () => new Response(null, { status: 204 }));
    assert.equal(await empty.requestJson("notifications/1/read"), null);
    const failed = new HttpClient("https://example.test/", async () => new Response('{"message":"denied"}', { status: 403 }));
    await assert.rejects(() => failed.requestJson("groups"), error =>
        error instanceof HttpError && error.status === 403 && error.payload.message === "denied",
    );
});

test("rejects paths outside the configured Gateway and malformed JSON", async () => {
    let calls = 0;
    const client = new HttpClient("https://example.test/api", async () => {
        calls += 1;
        return new Response("not json", { status: 200 });
    });
    await assert.rejects(() => client.requestJson("../other"));
    await assert.rejects(() => client.requestJson("https://other.test/path"));
    assert.equal(calls, 0);
    await assert.rejects(() => client.requestJson("groups"), /JSON/);
});
