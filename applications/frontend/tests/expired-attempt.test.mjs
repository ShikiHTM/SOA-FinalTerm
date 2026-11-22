import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

let vite;
let ExpiredAttempt;

before(async () => {
    vite = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "silent",
    });
    ({ ExpiredAttempt } = await vite.ssrLoadModule("/src/features/contests/components/ExpiredAttempt.tsx"));
});

after(async () => {
    await vite?.close();
});

function renderStatus(status, error = "", submissionId = null) {
    return renderToStaticMarkup(createElement(
        MemoryRouter,
        null,
        createElement(ExpiredAttempt, { contestId: "contest-1", status, error, submissionId, onRetry: () => {} }),
    ));
}

test("shows progress while an expired attempt is submitted", () => {
    const html = renderStatus("submitting");
    assert.match(html, /Đang tự động nộp bài/);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /Thử nộp lại/);
});

test("distinguishes submitted, never started and missing draft", () => {
    const submitted = renderStatus("submitted", "", "submission-1");
    assert.match(submitted, /Bạn đã nộp bài/);
    assert.match(submitted, /href="\/submissions\/submission-1"/);
    const notStarted = renderStatus("not_started");
    assert.match(notStarted, /chưa bắt đầu làm bài/);
    assert.doesNotMatch(notStarted, /Thử nộp lại/);
    const missingDraft = renderStatus("draft_missing");
    assert.match(missingDraft, /không tìm thấy bản nháp/);
    assert.doesNotMatch(missingDraft, /Thử nộp lại/);
});

test("shows the submission error and retry action after a failure", () => {
    const html = renderStatus("failed", "Không thể kết nối");
    assert.match(html, /Không thể tự động nộp bài: Không thể kết nối/);
    assert.match(html, /role="alert"/);
    assert.match(html, /Thử nộp lại/);
    assert.match(html, /href="\/contests\/contest-1"/);
});
