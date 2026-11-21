import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { createServer } from "vite";

let vite;
let watchContestClock;
let getContestStatus;
let ContestDetail;

before(async () => {
    vite = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "silent",
    });
    ({ watchContestClock, getContestStatus } = await vite.ssrLoadModule(
        "/src/features/contests/utils/contestClock.ts",
    ));
    ({ ContestDetail } = await vite.ssrLoadModule(
        "/src/features/contests/pages/ContestDetailPage.tsx",
    ));
});

after(async () => {
    await vite?.close();
});

function createClock(initialTime) {
    let current = initialTime;
    let nextId = 0;
    let resume;
    const timers = new Map();
    return {
        now: () => current,
        setTimer(callback, delay) {
            const id = ++nextId;
            timers.set(id, { callback, at: current + delay });
            return id;
        },
        clearTimer(id) { timers.delete(id); },
        onResume(callback) {
            resume = callback;
            return () => { resume = undefined; };
        },
        advanceTo(time) {
            const next = [...timers.entries()].find(([, timer]) => timer.at <= time);
            if (!next) throw new Error("No timer due");
            current = next[1].at;
            timers.delete(next[0]);
            next[1].callback();
        },
        resumeAt(time) { current = time; resume?.(); },
        get timerCount() { return timers.size; },
        get nextDelay() { return [...timers.values()][0]?.at - current; },
        get hasResumeListener() { return Boolean(resume); },
    };
}

test("updates exactly at contest start and end without polling", () => {
    const clock = createClock(1_000);
    const start = new Date(2_000).toISOString();
    const end = new Date(5_000).toISOString();
    const statuses = [];
    const stop = watchContestClock(start, end, now => statuses.push(getContestStatus(start, end, now)), clock);

    assert.deepEqual(statuses, ["Sắp diễn ra"]);
    clock.advanceTo(2_000);
    assert.deepEqual(statuses, ["Sắp diễn ra", "Đang diễn ra"]);
    clock.advanceTo(5_000);
    assert.deepEqual(statuses, ["Sắp diễn ra", "Đang diễn ra", "Đã kết thúc"]);
    assert.equal(clock.timerCount, 0);
    stop();
    assert.equal(clock.hasResumeListener, false);
});

test("recalculates after the tab resumes and cleans up the timer", () => {
    const clock = createClock(1_000);
    const start = new Date(2_000).toISOString();
    const end = new Date(5_000).toISOString();
    const statuses = [];
    const stop = watchContestClock(start, end, now => statuses.push(getContestStatus(start, end, now)), clock);

    clock.resumeAt(3_000);
    assert.equal(statuses.at(-1), "Đang diễn ra");
    assert.equal(clock.timerCount, 1);
    assert.equal(clock.nextDelay, 2_000);
    stop();
    assert.equal(clock.timerCount, 0);
    assert.equal(clock.hasResumeListener, false);
});

test("handles deadlines beyond the browser timer limit", () => {
    const clock = createClock(0);
    const start = new Date(3_000_000_000).toISOString();
    const end = new Date(3_000_010_000).toISOString();
    const statuses = [];
    const stop = watchContestClock(start, end, now => statuses.push(getContestStatus(start, end, now)), clock);

    assert.equal(clock.nextDelay, 2_147_483_647);
    clock.advanceTo(2_147_483_647);
    assert.equal(statuses.at(-1), "Sắp diễn ra");
    assert.equal(clock.nextDelay, 3_000_000_000 - 2_147_483_647);
    clock.advanceTo(3_000_000_000);
    assert.equal(statuses.at(-1), "Đang diễn ra");
    stop();
});

test("the detail page only offers participation during the contest window", () => {
    const originalNow = Date.now;
    const context = {
        email: "user@example.test",
        data: {
            groups: [{ id: "group", name: "Nhóm", visibility: "PUBLIC", role: "VISITOR" }],
            assessments: [{ id: "exam", groupId: "group", title: "Đề", source: "DIRECT", questions: [] }],
            contests: [{ id: "contest", assessmentId: "exam", title: "Thi", startAt: new Date(2_000).toISOString(), endAt: new Date(5_000).toISOString(), policy: "MULTIPLE" }],
            submissions: [],
        },
    };
    function renderAt(time) {
        Date.now = () => time;
        return renderToStaticMarkup(createElement(
            MemoryRouter,
            { initialEntries: ["/contests/contest"] },
            createElement(
                Routes,
                null,
                createElement(
                    Route,
                    { element: createElement(Outlet, { context }) },
                    createElement(Route, { path: "/contests/:contestId", element: createElement(ContestDetail) }),
                ),
            ),
        ));
    }
    try {
        const upcoming = renderAt(1_999);
        assert.match(upcoming, /Sắp diễn ra/);
        assert.doesNotMatch(upcoming, /Bắt đầu làm bài/);
        const ongoing = renderAt(2_000);
        assert.match(ongoing, /Đang diễn ra/);
        assert.match(ongoing, /Bắt đầu làm bài/);
        const ended = renderAt(5_000);
        assert.match(ended, /Đã kết thúc/);
        assert.doesNotMatch(ended, /Bắt đầu làm bài/);
    } finally {
        Date.now = originalNow;
    }
});
