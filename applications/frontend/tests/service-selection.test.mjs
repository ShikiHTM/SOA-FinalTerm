import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let selectServices;
let createMockServices;
let createGatewayAdapter;

before(async () => {
    vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
    ({ selectServices } = await vite.ssrLoadModule("/src/data/selectServices.ts"));
    ({ createMockServices } = await vite.ssrLoadModule("/src/data/mock/services.ts"));
    ({ createGatewayAdapter } = await vite.ssrLoadModule("/src/data/gateway/adapter.ts"));
});

after(async () => {
    await vite?.close();
});

test("selects either the mock or configured API adapter without changing consumers", () => {
    const mock = createMockServices();
    const api = { ...mock, demo: undefined, rolePreview: undefined };
    let mockCalls = 0;
    let apiCalls = 0;
    const factories = {
        mock: () => { mockCalls += 1; return mock; },
        api: () => { apiCalls += 1; return api; },
    };
    assert.equal(selectServices(undefined, factories).services, mock);
    assert.equal(selectServices("mock", factories).services, mock);
    assert.equal(selectServices("api", factories).services, api);
    assert.equal(mockCalls, 2);
    assert.equal(apiCalls, 1);
});

test("invalid configuration and unfinished API never silently fall back to mock", () => {
    let mockCalls = 0;
    const factories = {
        mock: () => { mockCalls += 1; return createMockServices(); },
        api: () => createGatewayAdapter("http://localhost:3000/api/v1"),
    };
    const invalid = selectServices("unknown", factories);
    assert.equal(invalid.services, null);
    assert.match(invalid.error, /không hợp lệ/);
    const unfinished = selectServices("api", factories);
    assert.equal(unfinished.services, null);
    assert.match(unfinished.error, /chưa hoàn thiện/);
    assert.equal(mockCalls, 0);
    assert.throws(() => createGatewayAdapter(undefined), /VITE_API_BASE_URL/);
    assert.throws(() => createGatewayAdapter("javascript:alert(1)"), /không hợp lệ/);
});
