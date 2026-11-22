import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

function storage() {
    const entries = new Map();
    return {
        get length() { return entries.size; },
        key(index) { return [...entries.keys()][index] ?? null; },
        getItem(key) { return entries.get(key) ?? null; },
        setItem(key, value) { entries.set(key, String(value)); },
        removeItem(key) { entries.delete(key); },
    };
}

test("one preview account changes roles without changing ordinary mock data", async () => {
    globalThis.localStorage = storage();
    globalThis.sessionStorage = storage();
    const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
    try {
        const { getServices } = await vite.ssrLoadModule("/src/data/services.ts");
        const services = getServices();
        assert.equal(await services.accounts.authenticate("rbac@lms.local", "demo123"), "rbac@lms.local");
        services.session.save("rbac@lms.local");
        const user = services.createDataSource("rbac@lms.local");
        const ordinary = services.createDataSource("owner@lms.local");
        const preview = services.rolePreview;
        assert.ok(preview?.isEnabled("rbac@lms.local"));

        for (const role of ["VISITOR", "MEMBER", "MODERATOR", "OWNER"]) {
            preview.set(role);
            assert.equal((await user.read()).groups.find(group => group.id === "private").role, role);
        }
        await user.updateGroup("private", "Sandbox only", "", "PRIVATE", "APPROVAL", "");
        assert.notEqual((await ordinary.read()).groups.find(group => group.id === "private").name, "Sandbox only");
        preview.set("MEMBER");
        await assert.rejects(() => user.updateGroup("private", "No permission", "", "PRIVATE", "APPROVAL", ""));
        await assert.rejects(() => user.adminDeleteGroup("web"));
        preview.set("SYSTEM_ADMIN");
        assert.equal(services.accounts.isSystemAdmin("rbac@lms.local"), true);
        await user.adminDeleteGroup("web");
        assert.ok((await ordinary.read()).groups.some(group => group.id === "web"));
        await services.accounts.setStatus("rbac@lms.local", "user@lms.local", "BANNED");
        assert.equal((await services.accounts.list()).find(account => account.email === "user@lms.local").status, "BANNED");
        preview.reset();
        assert.ok((await user.read()).groups.some(group => group.id === "web"));
        assert.equal((await services.accounts.list()).find(account => account.email === "user@lms.local").status, "ACTIVE");
        services.session.clear();
        assert.equal((await services.accounts.list()).find(account => account.email === "user@lms.local").status, "ACTIVE");
    } finally {
        await vite.close();
    }
});
