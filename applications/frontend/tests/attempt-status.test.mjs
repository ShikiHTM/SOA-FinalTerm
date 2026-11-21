import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createServer } from "vite";

function storage() {
    const entries = new Map();
    return {
        getItem(key) { return entries.get(key) ?? null; },
        setItem(key, value) { entries.set(key, String(value)); },
        removeItem(key) { entries.delete(key); },
        key(index) { return [...entries.keys()][index] ?? null; },
        get length() { return entries.size; },
    };
}

test("mock distinguishes pending and submitted attempts for each user", async () => {
    globalThis.localStorage = storage();
    globalThis.sessionStorage = storage();
    globalThis.crypto ??= webcrypto;
    const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
    try {
        const { getServices } = await vite.ssrLoadModule("/src/data/services.ts");
        const { resolveExpiredAttempt } = await vite.ssrLoadModule("/src/features/contests/utils/resolveExpiredAttempt.ts");
        const services = getServices();
        const user = services.createDataSource("user@lms.local");
        const other = services.createDataSource("owner@lms.local");
        const contest = (await user.read()).contests.find(item =>
            Date.parse(item.startAt) <= Date.now() && Date.now() < Date.parse(item.endAt));
        assert.ok(contest, "Mock data needs an active contest");
        assert.equal((await resolveExpiredAttempt(user, contest.id, false)).state, "NOT_STARTED");
        await user.startAttempt(contest.id);
        assert.equal((await resolveExpiredAttempt(user, contest.id, true)).state, "IN_PROGRESS");
        assert.equal((await resolveExpiredAttempt(user, contest.id, false)).state, "DRAFT_MISSING");
        assert.equal((await other.getAttemptStatus(contest.id)).state, "NOT_STARTED");
        await user.submit(contest.id, {});
        const submitted = await resolveExpiredAttempt(user, contest.id, false);
        assert.equal(submitted.state, "SUBMITTED");
        assert.ok(submitted.submissionId);
        assert.equal((await other.getAttemptStatus(contest.id)).state, "NOT_STARTED");
    } finally {
        await vite.close();
    }
});
