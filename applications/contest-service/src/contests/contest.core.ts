import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { ContestSchema, type ContestEntity } from "../db/entities/contest.entity";
import type {
    AssessmentSummaryInfo,
    GroupMembershipInfo,
    ServiceClients
} from "../shared/clients";
import { AppError } from "../shared/errors";
import { lmsContestParticipationChecksTotal } from "../shared/metrics";
import {
    AssessmentStatus,
    AssessmentVisibility,
    ContestPhase,
    ContestStatus,
    ContestSubmissionPolicy,
    ContestVisibility,
    GroupStatus,
    GroupVisibility,
    UserSystemRole,
    type PaginatedResult,
    type PaginationMeta
} from "../shared/types";
import type {
    CreateContestDto,
    ListContestsQuery,
    UpdateContestDto
} from "./schemas/contest.schema";

export interface ContestSummary {
    id: string;
    group_id: string;
    assessment_id: string;
    assessment_version: number;
    organizer_id: string;
    title: string;
    description: string;
    visibility: ContestVisibility;
    start_time: string;
    end_time: string;
    submission_policy: ContestSubmissionPolicy;
    status: ContestStatus;
    phase: ContestPhase;
    created_at: string;
    updated_at: string;
}

export interface ContestParticipationInfo {
    contest_id: string;
    group_id: string;
    assessment_id: string;
    assessment_version: number;
    visibility: ContestVisibility;
    status: ContestStatus;
    phase: ContestPhase;
    start_time: string;
    end_time: string;
    submission_policy: ContestSubmissionPolicy;
    is_group_member: boolean;
    can_participate: boolean;
    denial_reason: string | null;
}

export interface InternalSubmissionContext {
    contest_id: string;
    group_id: string;
    assessment_id: string;
    assessment_version: number;
    organizer_id: string;
    visibility: ContestVisibility;
    status: ContestStatus;
    phase: ContestPhase;
    start_time: string;
    end_time: string;
    submission_policy: ContestSubmissionPolicy;
    evaluation_rule: "SINGLE_ATTEMPT" | "FINAL_ATTEMPT_ONLY";
    is_group_member: boolean;
    can_submit: boolean;
    denial_reason: string | null;
}

export function buildPaginationMeta(
    page: number,
    limit: number,
    total: number
): PaginationMeta {
    return {
        page,
        limit,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / limit)
    };
}

export function computeContestPhase(
    contest: Pick<ContestEntity, "status" | "startTime" | "endTime">,
    now: Date = new Date()
): ContestPhase {
    if (contest.status === ContestStatus.CANCELLED) {
        return ContestPhase.CANCELLED;
    }
    if (contest.status === ContestStatus.DRAFT) {
        return ContestPhase.DRAFT;
    }
    const nowMs = now.getTime();
    if (nowMs < contest.startTime.getTime()) {
        return ContestPhase.UPCOMING;
    }
    if (nowMs >= contest.endTime.getTime()) {
        return ContestPhase.ENDED;
    }
    return ContestPhase.ONGOING;
}

export function toContestSummary(contest: ContestEntity, now: Date = new Date()): ContestSummary {
    return {
        id: contest.id,
        group_id: contest.groupId,
        assessment_id: contest.assessmentId,
        assessment_version: contest.assessmentVersion,
        organizer_id: contest.organizerId,
        title: contest.title,
        description: contest.description,
        visibility: contest.visibility,
        start_time: contest.startTime.toISOString(),
        end_time: contest.endTime.toISOString(),
        submission_policy: contest.submissionPolicy,
        status: contest.status,
        phase: computeContestPhase(contest, now),
        created_at: contest.createdAt.toISOString(),
        updated_at: contest.updatedAt.toISOString()
    };
}

export async function findActiveContestOrThrow(
    contestId: string,
    em: EntityManager
): Promise<ContestEntity> {
    const contest = await em.findOne(ContestSchema, {
        id: contestId,
        deletedAt: null
    });
    if (contest === null) {
        throw AppError.notFound("CONTEST_NOT_FOUND", "Contest not found.");
    }
    return contest;
}

export function applyPhaseFilter(
    where: FilterQuery<ContestEntity>,
    phase: ContestPhase,
    now: Date
): void {
    if (phase === ContestPhase.CANCELLED) {
        where.status = ContestStatus.CANCELLED;
        return;
    }
    if (phase === ContestPhase.DRAFT) {
        where.status = ContestStatus.DRAFT;
        return;
    }
    where.status = ContestStatus.PUBLISHED;
    if (phase === ContestPhase.UPCOMING) {
        where.startTime = { $gt: now };
        return;
    }
    if (phase === ContestPhase.ONGOING) {
        where.startTime = { $lte: now };
        where.endTime = { $gt: now };
        return;
    }
    where.endTime = { $lte: now };
}

async function resolveActiveGroupMembership(
    groupId: string,
    userId: string,
    clients: ServiceClients
): Promise<GroupMembershipInfo> {
    const membership = await clients.getGroupMembership(groupId, userId);
    if (membership.group_status !== GroupStatus.ACTIVE) {
        throw AppError.forbidden("GROUP_SUSPENDED", "Owning group is currently suspended.");
    }
    if (membership.is_banned) {
        throw AppError.forbidden("GROUP_ACCESS_DENIED", "You are banned from this group.");
    }
    return membership;
}

async function requireGroupManagerAccess(
    groupId: string,
    actorId: string,
    actorRole: UserSystemRole,
    clients: ServiceClients
): Promise<void> {
    if (actorRole === UserSystemRole.ADMIN) {
        return;
    }
    const membership = await resolveActiveGroupMembership(groupId, actorId, clients);
    if (!membership.can_manage) {
        throw AppError.forbidden(
            "INSUFFICIENT_GROUP_ROLE",
            "Group moderator or owner role is required to manage contests."
        );
    }
}

async function verifyAssessmentForContest(
    assessmentId: string,
    groupId: string,
    targetStatus: ContestStatus,
    clients: ServiceClients
): Promise<AssessmentSummaryInfo> {
    const assessment = await clients.getAssessmentSummary(assessmentId);
    if (assessment.group_id !== groupId) {
        throw AppError.badRequest(
            "ASSESSMENT_GROUP_MISMATCH",
            "Contest must reference an assessment belonging to the same group."
        );
    }
    if (assessment.status !== AssessmentStatus.ACTIVE) {
        throw AppError.badRequest(
            "ASSESSMENT_UNAVAILABLE",
            "Selected assessment is currently hidden or unavailable."
        );
    }
    if (
        targetStatus === ContestStatus.PUBLISHED &&
        assessment.visibility === AssessmentVisibility.DRAFT
    ) {
        throw AppError.badRequest(
            "ASSESSMENT_NOT_PUBLISHED",
            "Cannot publish a contest linked to a draft assessment."
        );
    }
    return assessment;
}

async function requireContestReadAccess(
    contest: ContestEntity,
    viewerId: string | undefined,
    viewerRole: UserSystemRole | undefined,
    clients: ServiceClients
): Promise<void> {
    if (viewerRole === UserSystemRole.ADMIN) {
        return;
    }
    if (
        contest.visibility === ContestVisibility.PUBLIC &&
        contest.status !== ContestStatus.DRAFT
    ) {
        return;
    }
    if (viewerId === undefined) {
        throw AppError.forbidden(
            "GROUP_MEMBERSHIP_REQUIRED",
            "Authentication and group membership are required to view this contest."
        );
    }
    const membership = await resolveActiveGroupMembership(contest.groupId, viewerId, clients);
    if (contest.visibility === ContestVisibility.PRIVATE && !membership.is_member) {
        throw AppError.forbidden(
            "GROUP_MEMBERSHIP_REQUIRED",
            "Group membership is required to view this private contest."
        );
    }
    if (contest.status === ContestStatus.DRAFT && !membership.can_manage) {
        throw AppError.forbidden(
            "CONTEST_NOT_ACCESSIBLE",
            "Draft contests are only visible to group managers."
        );
    }
}

function emptyPaginatedContests(page: number, limit: number): PaginatedResult<ContestSummary> {
    return {
        items: [],
        pagination: buildPaginationMeta(page, limit, 0)
    };
}

export async function listContests(
    query: ListContestsQuery,
    viewerId: string | undefined,
    viewerRole: UserSystemRole | undefined,
    clients: ServiceClients,
    em: EntityManager
): Promise<PaginatedResult<ContestSummary>> {
    const now = new Date();
    const isAdmin = viewerRole === UserSystemRole.ADMIN;
    const where: FilterQuery<ContestEntity> = {
        deletedAt: null
    };

    let canManageGroup = isAdmin;

    if (query.group_id === undefined) {
        if (!isAdmin) {
            if (query.visibility === ContestVisibility.PRIVATE) {
                throw AppError.badRequest(
                    "GROUP_ID_REQUIRED",
                    "group_id is required when browsing private group contests."
                );
            }
            where.visibility = ContestVisibility.PUBLIC;
        } else if (query.visibility !== undefined) {
            where.visibility = query.visibility;
        }
    } else {
        where.groupId = query.group_id;
        if (!isAdmin) {
            if (viewerId === undefined) {
                if (query.visibility === ContestVisibility.PRIVATE) {
                    throw AppError.forbidden(
                        "GROUP_MEMBERSHIP_REQUIRED",
                        "Group membership is required to view private contests."
                    );
                }
                where.visibility = ContestVisibility.PUBLIC;
            } else {
                const membership = await resolveActiveGroupMembership(
                    query.group_id,
                    viewerId,
                    clients
                );
                canManageGroup = membership.can_manage;
                if (
                    (membership.visibility === GroupVisibility.PRIVATE ||
                        query.visibility === ContestVisibility.PRIVATE) &&
                    !membership.is_member
                ) {
                    throw AppError.forbidden(
                        "GROUP_MEMBERSHIP_REQUIRED",
                        "Group membership is required to view private group contests."
                    );
                }
                if (query.visibility !== undefined) {
                    where.visibility = query.visibility;
                } else if (!membership.is_member) {
                    where.visibility = ContestVisibility.PUBLIC;
                }
            }
        } else if (query.visibility !== undefined) {
            where.visibility = query.visibility;
        }
    }

    if (!canManageGroup) {
        if (query.status === ContestStatus.DRAFT || query.phase === ContestPhase.DRAFT) {
            return emptyPaginatedContests(query.page, query.limit);
        }
        if (query.phase !== undefined) {
            if (
                query.status !== undefined &&
                ((query.phase === ContestPhase.CANCELLED &&
                    query.status !== ContestStatus.CANCELLED) ||
                    (query.phase !== ContestPhase.CANCELLED &&
                        query.status === ContestStatus.CANCELLED))
            ) {
                return emptyPaginatedContests(query.page, query.limit);
            }
            applyPhaseFilter(where, query.phase, now);
        } else if (query.status !== undefined) {
            where.status = query.status;
        } else {
            where.status = ContestStatus.PUBLISHED;
        }
    } else if (query.phase !== undefined) {
        let expectedStatus: ContestStatus = ContestStatus.PUBLISHED;
        if (query.phase === ContestPhase.DRAFT) {
            expectedStatus = ContestStatus.DRAFT;
        } else if (query.phase === ContestPhase.CANCELLED) {
            expectedStatus = ContestStatus.CANCELLED;
        }
        if (query.status !== undefined && query.status !== expectedStatus) {
            return emptyPaginatedContests(query.page, query.limit);
        }
        applyPhaseFilter(where, query.phase, now);
    } else if (query.status !== undefined) {
        where.status = query.status;
    }

    if (query.search !== undefined && query.search.length > 0) {
        const pattern = `%${query.search}%`;
        where.$or = [{ title: { $ilike: pattern } }, { description: { $ilike: pattern } }];
    }

    const offset = (query.page - 1) * query.limit;
    const [contests, total] = await em.findAndCount(ContestSchema, where, {
        orderBy: { startTime: "DESC" },
        limit: query.limit,
        offset
    });

    return {
        items: contests.map((contest): ContestSummary => toContestSummary(contest, now)),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function getContestById(
    contestId: string,
    viewerId: string | undefined,
    viewerRole: UserSystemRole | undefined,
    clients: ServiceClients,
    em: EntityManager
): Promise<ContestSummary> {
    const contest = await findActiveContestOrThrow(contestId, em);
    await requireContestReadAccess(contest, viewerId, viewerRole, clients);
    return toContestSummary(contest);
}

export async function createContest(
    actorId: string,
    actorRole: UserSystemRole,
    payload: CreateContestDto,
    clients: ServiceClients,
    em: EntityManager
): Promise<ContestSummary> {
    await requireGroupManagerAccess(payload.group_id, actorId, actorRole, clients);
    const assessment = await verifyAssessmentForContest(
        payload.assessment_id,
        payload.group_id,
        payload.status,
        clients
    );

    const contest = em.create(ContestSchema, {
        id: v4(),
        groupId: payload.group_id,
        assessmentId: payload.assessment_id,
        assessmentVersion: assessment.version,
        organizerId: actorId,
        title: payload.title,
        description: payload.description,
        visibility: payload.visibility,
        startTime: new Date(payload.start_time),
        endTime: new Date(payload.end_time),
        submissionPolicy: payload.submission_policy,
        status: payload.status
    });
    em.persist(contest);
    await em.flush();

    return toContestSummary(contest);
}

export async function updateContest(
    contestId: string,
    actorId: string,
    actorRole: UserSystemRole,
    payload: UpdateContestDto,
    clients: ServiceClients,
    em: EntityManager
): Promise<ContestSummary> {
    const contest = await findActiveContestOrThrow(contestId, em);
    await requireGroupManagerAccess(contest.groupId, actorId, actorRole, clients);

    const now = new Date();
    const currentPhase = computeContestPhase(contest, now);
    if (currentPhase === ContestPhase.CANCELLED || currentPhase === ContestPhase.ENDED) {
        throw AppError.conflict(
            "CONTEST_NOT_EDITABLE",
            "Cancelled or ended contests cannot be modified."
        );
    }

    if (
        currentPhase === ContestPhase.ONGOING &&
        (payload.assessment_id !== undefined ||
            payload.start_time !== undefined ||
            payload.submission_policy !== undefined ||
            payload.status === ContestStatus.DRAFT)
    ) {
        throw AppError.conflict(
            "CONTEST_IN_PROGRESS",
            "Cannot modify assessment, start_time, submission_policy, or unpublish while contest is ongoing."
        );
    }

    const nextStartTime = payload.start_time ? new Date(payload.start_time) : contest.startTime;
    const nextEndTime = payload.end_time ? new Date(payload.end_time) : contest.endTime;
    if (nextStartTime.getTime() >= nextEndTime.getTime()) {
        throw AppError.badRequest("INVALID_TIME_WINDOW", "start_time must precede end_time.");
    }
    if (currentPhase === ContestPhase.ONGOING && nextEndTime.getTime() <= now.getTime()) {
        throw AppError.badRequest(
            "INVALID_TIME_WINDOW",
            "end_time of an ongoing contest must remain in the future."
        );
    }

    const nextAssessmentId = payload.assessment_id ?? contest.assessmentId;
    const nextStatus = payload.status ?? contest.status;
    if (
        payload.assessment_id !== undefined ||
        (contest.status === ContestStatus.DRAFT && nextStatus === ContestStatus.PUBLISHED)
    ) {
        const assessment = await verifyAssessmentForContest(
            nextAssessmentId,
            contest.groupId,
            nextStatus,
            clients
        );
        contest.assessmentId = nextAssessmentId;
        contest.assessmentVersion = assessment.version;
    }

    if (payload.title !== undefined) {
        contest.title = payload.title;
    }
    if (payload.description !== undefined) {
        contest.description = payload.description;
    }
    if (payload.visibility !== undefined) {
        contest.visibility = payload.visibility;
    }
    if (payload.submission_policy !== undefined) {
        contest.submissionPolicy = payload.submission_policy;
    }
    contest.startTime = nextStartTime;
    contest.endTime = nextEndTime;
    contest.status = nextStatus;
    contest.updatedAt = now;
    await em.flush();

    return toContestSummary(contest, now);
}

export async function cancelContest(
    contestId: string,
    actorId: string,
    actorRole: UserSystemRole,
    clients: ServiceClients,
    em: EntityManager
): Promise<ContestSummary> {
    const contest = await findActiveContestOrThrow(contestId, em);
    await requireGroupManagerAccess(contest.groupId, actorId, actorRole, clients);

    const now = new Date();
    const currentPhase = computeContestPhase(contest, now);
    if (currentPhase === ContestPhase.CANCELLED) {
        throw AppError.conflict("CONTEST_ALREADY_CANCELLED", "Contest is already cancelled.");
    }
    if (currentPhase === ContestPhase.ENDED) {
        throw AppError.conflict("CONTEST_ALREADY_ENDED", "Ended contests cannot be cancelled.");
    }

    contest.status = ContestStatus.CANCELLED;
    contest.updatedAt = now;
    await em.flush();

    return toContestSummary(contest, now);
}

export async function deleteContest(
    contestId: string,
    actorId: string,
    actorRole: UserSystemRole,
    clients: ServiceClients,
    em: EntityManager
): Promise<void> {
    const contest = await findActiveContestOrThrow(contestId, em);
    await requireGroupManagerAccess(contest.groupId, actorId, actorRole, clients);

    const now = new Date();
    if (computeContestPhase(contest, now) === ContestPhase.ONGOING) {
        throw AppError.conflict(
            "CONTEST_IN_PROGRESS",
            "Ongoing contests cannot be deleted; cancel the contest first."
        );
    }

    contest.deletedAt = now;
    contest.deletedBy = actorId;
    contest.updatedAt = now;
    await em.flush();
}

async function evaluateContestEligibility(
    contest: ContestEntity,
    userId: string,
    userRole: UserSystemRole | undefined,
    clients: ServiceClients,
    now: Date
): Promise<{
    phase: ContestPhase;
    isGroupMember: boolean;
    canManage: boolean;
    allowed: boolean;
    denialReason: string | null;
}> {
    const phase = computeContestPhase(contest, now);
    const membership = await clients.getGroupMembership(contest.groupId, userId);

    let denialReason: string | null = null;
    if (membership.group_status !== GroupStatus.ACTIVE) {
        denialReason = "GROUP_SUSPENDED";
    } else if (membership.is_banned) {
        denialReason = "GROUP_BANNED";
    } else if (
        userRole !== UserSystemRole.ADMIN &&
        (contest.visibility === ContestVisibility.PRIVATE ||
            membership.visibility === GroupVisibility.PRIVATE) &&
        !membership.is_member
    ) {
        denialReason = "GROUP_MEMBERSHIP_REQUIRED";
    } else if (contest.status === ContestStatus.DRAFT) {
        denialReason = "CONTEST_NOT_PUBLISHED";
    } else if (contest.status === ContestStatus.CANCELLED) {
        denialReason = "CONTEST_CANCELLED";
    } else if (phase === ContestPhase.UPCOMING) {
        denialReason = "CONTEST_NOT_STARTED";
    } else if (phase === ContestPhase.ENDED) {
        denialReason = "CONTEST_ENDED";
    }

    const allowed: boolean = denialReason === null && phase === ContestPhase.ONGOING;
    lmsContestParticipationChecksTotal.inc({
        allowed: allowed ? "true" : "false",
        denial_reason: allowed ? "NONE" : (denialReason ?? `PHASE_${phase}`)
    });

    return {
        phase,
        isGroupMember: membership.is_member,
        canManage: membership.can_manage,
        allowed,
        denialReason
    };
}

export async function getContestParticipation(
    contestId: string,
    userId: string,
    userRole: UserSystemRole,
    clients: ServiceClients,
    em: EntityManager
): Promise<ContestParticipationInfo> {
    const contest = await findActiveContestOrThrow(contestId, em);
    const now = new Date();
    const eligibility = await evaluateContestEligibility(contest, userId, userRole, clients, now);

    if (
        contest.status === ContestStatus.DRAFT &&
        userRole !== UserSystemRole.ADMIN &&
        !eligibility.canManage
    ) {
        throw AppError.forbidden(
            "CONTEST_NOT_ACCESSIBLE",
            "Draft contests are only accessible to group managers."
        );
    }

    if (
        userRole !== UserSystemRole.ADMIN &&
        contest.visibility === ContestVisibility.PRIVATE &&
        !eligibility.isGroupMember
    ) {
        throw AppError.forbidden(
            "GROUP_MEMBERSHIP_REQUIRED",
            "Group membership is required to access this private contest."
        );
    }

    return {
        contest_id: contest.id,
        group_id: contest.groupId,
        assessment_id: contest.assessmentId,
        assessment_version: contest.assessmentVersion,
        visibility: contest.visibility,
        status: contest.status,
        phase: eligibility.phase,
        start_time: contest.startTime.toISOString(),
        end_time: contest.endTime.toISOString(),
        submission_policy: contest.submissionPolicy,
        is_group_member: eligibility.isGroupMember,
        can_participate: eligibility.allowed,
        denial_reason: eligibility.denialReason
    };
}

export async function getInternalSubmissionContext(
    contestId: string,
    userId: string,
    clients: ServiceClients,
    em: EntityManager
): Promise<InternalSubmissionContext> {
    const contest = await findActiveContestOrThrow(contestId, em);
    const now = new Date();
    const eligibility = await evaluateContestEligibility(
        contest,
        userId,
        undefined,
        clients,
        now
    );

    return {
        contest_id: contest.id,
        group_id: contest.groupId,
        assessment_id: contest.assessmentId,
        assessment_version: contest.assessmentVersion,
        organizer_id: contest.organizerId,
        visibility: contest.visibility,
        status: contest.status,
        phase: eligibility.phase,
        start_time: contest.startTime.toISOString(),
        end_time: contest.endTime.toISOString(),
        submission_policy: contest.submissionPolicy,
        evaluation_rule:
            contest.submissionPolicy === ContestSubmissionPolicy.MULTIPLE
                ? "FINAL_ATTEMPT_ONLY"
                : "SINGLE_ATTEMPT",
        is_group_member: eligibility.isGroupMember,
        can_submit: eligibility.allowed,
        denial_reason: eligibility.denialReason
    };
}
