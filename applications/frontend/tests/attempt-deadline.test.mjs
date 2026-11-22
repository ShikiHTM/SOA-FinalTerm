import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

test("deadline fires once with the latest answers and is cancelled on cleanup", async () => {
    const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
    try {
        const { watchAttemptDeadline } = await vite.ssrLoadModule("/src/features/contests/utils/attemptDeadline.ts");
        let now = 1_000;
        let nextId = 0;
        const timers = new Map();
        const clock = {
            now: () => now,
            setTimer(callback, delay) {
                const id = ++nextId;
                timers.set(id, { callback, at: now + delay });
                return id;
            },
            clearTimer(id) { timers.delete(id); },
        };
        let answers = { question: ["first"] };
        const submissions = [];
        const stop = watchAttemptDeadline(new Date(2_000).toISOString(), () => submissions.push(answers), clock);
        answers = { question: ["latest"] };
        assert.equal(timers.size, 1);
        const [id, timer] = [...timers.entries()][0];
        timers.delete(id);
        now = timer.at;
        timer.callback();
        assert.deepEqual(submissions, [{ question: ["latest"] }]);
        assert.equal(timers.size, 0);
        stop();

        const cancel = watchAttemptDeadline(new Date(3_000).toISOString(), () => submissions.push("unexpected"), clock);
        cancel();
        assert.equal(timers.size, 0);
        assert.equal(submissions.length, 1);
    } finally {
        await vite.close();
    }
});
