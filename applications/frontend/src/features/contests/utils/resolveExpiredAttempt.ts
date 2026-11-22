import type { SubmissionRecord } from "../../../api/types";

export type ExpiredAttemptResolution =
    | { state: "IN_PROGRESS" }
    | { state: "SUBMITTED"; submissionId: string }
    | { state: "NOT_STARTED" }
    | { state: "DRAFT_MISSING" };

export async function resolveExpiredAttempt(
    fetchContestSubmissions: () => Promise<SubmissionRecord[]>,
    hasDraft: boolean,
    startedInSession: boolean
): Promise<ExpiredAttemptResolution> {
    const existing: SubmissionRecord[] = await fetchContestSubmissions();
    if (existing.length > 0 && !startedInSession) {
        return { state: "SUBMITTED", submissionId: existing[0].id };
    }
    if (hasDraft) {
        return { state: "IN_PROGRESS" };
    }
    if (startedInSession) {
        return { state: "DRAFT_MISSING" };
    }
    if (existing.length > 0) {
        return { state: "SUBMITTED", submissionId: existing[0].id };
    }
    return { state: "NOT_STARTED" };
}
