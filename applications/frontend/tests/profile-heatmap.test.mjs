import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let buildActivityHeatmap;
let computeSubmissionStats;

before(async () => {
    vite = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "silent"
    });
    ({ buildActivityHeatmap, computeSubmissionStats } = await vite.ssrLoadModule(
        "/src/features/profiles/utils/activityHeatmap.ts"
    ));
});

after(async () => {
    await vite?.close();
});

test("builds weekly columns, activity levels, future flags, and streaks", () => {
    const fixedNow = new Date("2026-11-25T12:00:00Z");
    const timestamps = [
        "2026-11-10T09:00:00Z",
        "2026-11-11T09:00:00Z",
        "2026-11-12T09:00:00Z",
        "2026-11-13T09:00:00Z",
        "2026-11-20T08:00:00Z",
        "2026-11-20T12:00:00Z",
        "2026-11-20T18:00:00Z",
        "2026-11-23T10:00:00Z",
        "2026-11-24T10:00:00Z",
        "2026-11-24T14:00:00Z",
        "2026-11-25T08:00:00Z",
        "2026-11-25T09:00:00Z",
        "2026-11-25T10:00:00Z",
        "2026-11-25T11:00:00Z",
        "not-a-date"
    ];

    const heatmap = buildActivityHeatmap(timestamps, 4, fixedNow);

    assert.equal(heatmap.columns.length, 4);
    for (const column of heatmap.columns) {
        assert.equal(column.length, 7);
    }

    assert.equal(heatmap.totalSubmissions, 14);
    assert.equal(heatmap.activeDays, 8);
    assert.equal(heatmap.currentStreak, 3);
    assert.equal(heatmap.longestStreak, 4);

    const flatCells = heatmap.columns.flat();
    const cellFor = (dateKey) => flatCells.find((cell) => cell.dateKey === dateKey);

    assert.equal(cellFor("2026-11-22")?.level, 0);
    assert.equal(cellFor("2026-11-23")?.level, 1);
    assert.equal(cellFor("2026-11-24")?.level, 2);
    assert.equal(cellFor("2026-11-20")?.level, 3);
    assert.equal(cellFor("2026-11-25")?.level, 4);
    assert.equal(cellFor("2026-11-25")?.isFuture, false);
    assert.equal(cellFor("2026-11-26")?.isFuture, true);
    assert.equal(cellFor("2026-11-26")?.level, 0);
});

test("computes submission stats and ignores ungraded scores in average", () => {
    const summary = computeSubmissionStats([
        { total_score: 8, max_score: 10, submission_mode: "CONTEST" },
        { total_score: 5, max_score: 10, submission_mode: "PRACTICE" },
        { total_score: null, max_score: 20, submission_mode: "CONTEST" }
    ]);

    assert.equal(summary.total, 3);
    assert.equal(summary.gradedCount, 2);
    assert.equal(summary.averagePercent, 65);
    assert.equal(summary.contestCount, 2);
    assert.equal(summary.practiceCount, 1);

    const ungradedOnly = computeSubmissionStats([{ total_score: null, max_score: 10 }]);
    assert.equal(ungradedOnly.gradedCount, 0);
    assert.equal(ungradedOnly.averagePercent, null);
});
