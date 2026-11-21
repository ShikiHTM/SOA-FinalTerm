import type { AttemptStatus, ContestDataSource } from "../../../data/contracts/dataSource";

export type ExpiredAttemptResolution = AttemptStatus | { state: "DRAFT_MISSING" };

export async function resolveExpiredAttempt(
    api: Pick<ContestDataSource, "getAttemptStatus">,
    contestId: string,
    hasDraft: boolean,
): Promise<ExpiredAttemptResolution> {
    const attempt: AttemptStatus = await api.getAttemptStatus(contestId);
    if (attempt.state === "IN_PROGRESS" && !hasDraft) return { state: "DRAFT_MISSING" };
    return attempt;
}
