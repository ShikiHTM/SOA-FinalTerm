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
        logLevel: "silent"
    });
    ({ ExpiredAttempt } = await vite.ssrLoadModule(
        "/src/features/contests/components/ExpiredAttempt.tsx"
    ));
});

after(async () => {
    await vite?.close();
});

function renderStatus(status, error = "", submissionId = null) {
    return renderToStaticMarkup(
        createElement(
            MemoryRouter,
            null,
            createElement(ExpiredAttempt, {
                contestId: "contest-1",
                status,
                error,
                submissionId,
                onRetry: () => undefined
            })
        )
    );
}

test("shows progress while an expired attempt is submitted", () => {
    const html = renderStatus("submitting");
    assert.match(html, /Auto-submitting your answers\.\.\./);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /Retry submission/);
});

test("distinguishes submitted, never started and missing draft", () => {
    const submitted = renderStatus("submitted", "", "submission-1");
    assert.match(submitted, /already been submitted/);
    assert.match(submitted, /href="\/submissions\/submission-1"/);

    const notStarted = renderStatus("not_started");
    assert.match(notStarted, /ended before you started an attempt/);
    assert.doesNotMatch(notStarted, /Retry submission/);

    const missingDraft = renderStatus("draft_missing");
    assert.match(missingDraft, /no saved draft was found/);
    assert.doesNotMatch(missingDraft, /Retry submission/);
});

test("shows the submission error and retry action after a failure", () => {
    const html = renderStatus("failed", "Network unavailable");
    assert.match(html, /Unable to auto-submit: Network unavailable/);
    assert.match(html, /role="alert"/);
    assert.match(html, /Retry submission/);
    assert.match(html, /href="\/contests\/contest-1"/);
});
