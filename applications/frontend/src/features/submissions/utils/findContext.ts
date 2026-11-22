import type { Assessment, Contest, Group, Submission } from "../../../types";

export type SubmissionContext = {
    contest: Contest | undefined;
    assessment: Assessment | undefined;
    group: Group | undefined;
};

export function findContext(
    submission: Submission,
    contests: Contest[],
    assessments: Assessment[],
    groups: Group[],
): SubmissionContext {
    const contest: Contest | undefined = contests.find(
        (item: Contest): boolean => item.id === submission.contestId,
    );
    const assessment: Assessment | undefined = assessments.find(
        (item: Assessment): boolean => item.id === contest?.assessmentId,
    );
    const group: Group | undefined = groups.find(
        (item: Group): boolean => item.id === assessment?.groupId,
    );
    return { contest, assessment, group };
}
