import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type AutoSubmitStatus =
    | "waiting"
    | "submitting"
    | "failed"
    | "submitted"
    | "not_started"
    | "draft_missing";

export function ExpiredAttempt({
    contestId,
    status,
    error,
    submissionId,
    onRetry
}: {
    contestId: string;
    status: AutoSubmitStatus;
    error: string;
    submissionId: string | null;
    onRetry: () => void;
}): ReactNode {
    return (
        <section className="panel form page-enter">
            <h1>Contest has ended</h1>
            {status === "failed" ? (
                <>
                    <p className="error" role="alert">
                        Unable to auto-submit: {error}
                    </p>
                    <p>Your local browser draft is preserved if saved before the deadline.</p>
                    <button className="button primary" type="button" onClick={onRetry}>
                        Retry submission
                    </button>
                </>
            ) : status === "submitted" ? (
                <>
                    <p role="status">Your attempt has already been submitted for this contest.</p>
                    {submissionId && (
                        <Link className="button primary" to={`/submissions/${submissionId}`}>
                            View submission
                        </Link>
                    )}
                </>
            ) : status === "not_started" ? (
                <p role="status">The contest ended before you started an attempt.</p>
            ) : status === "draft_missing" ? (
                <p role="alert">
                    An unsubmitted attempt was detected, but no saved draft was found in this
                    browser.
                </p>
            ) : (
                <p role="status" aria-live="polite">
                    {status === "submitting"
                        ? "Auto-submitting your answers..."
                        : "Checking your attempt status..."}
                </p>
            )}
            <Link className="button" to={`/contests/${contestId}`}>
                Back to contest details
            </Link>
        </section>
    );
}
