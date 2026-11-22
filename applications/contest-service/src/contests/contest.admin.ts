import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { ContestSchema, type ContestEntity } from "../db/entities/contest.entity";
import { ContestStatus, type PaginatedResult } from "../shared/types";
import {
    applyPhaseFilter,
    buildPaginationMeta,
    findActiveContestOrThrow,
    toContestSummary,
    type ContestSummary
} from "./contest.core";
import type { AdminStatusDto, ListContestsQuery } from "./schemas/contest.schema";

export interface AdminContestRecord extends ContestSummary {
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
}

function toAdminContestRecord(contest: ContestEntity, now: Date = new Date()): AdminContestRecord {
    return {
        ...toContestSummary(contest, now),
        moderation_reason: contest.moderationReason ?? null,
        moderated_by: contest.moderatedBy ?? null,
        moderated_at: contest.moderatedAt ? contest.moderatedAt.toISOString() : null
    };
}

export async function listContestsForAdmin(
    query: ListContestsQuery,
    em: EntityManager
): Promise<PaginatedResult<AdminContestRecord>> {
    const now = new Date();
    const where: FilterQuery<ContestEntity> = {
        deletedAt: null
    };
    if (query.group_id !== undefined) {
        where.groupId = query.group_id;
    }
    if (query.visibility !== undefined) {
        where.visibility = query.visibility;
    }
    if (query.phase !== undefined) {
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
        orderBy: { createdAt: "DESC" },
        limit: query.limit,
        offset
    });

    return {
        items: contests.map((contest): AdminContestRecord => toAdminContestRecord(contest, now)),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function getContestForAdmin(
    contestId: string,
    em: EntityManager
): Promise<AdminContestRecord> {
    const contest = await findActiveContestOrThrow(contestId, em);
    return toAdminContestRecord(contest);
}

export async function updateContestStatusByAdmin(
    contestId: string,
    adminUserId: string,
    payload: AdminStatusDto,
    em: EntityManager
): Promise<AdminContestRecord> {
    const contest = await findActiveContestOrThrow(contestId, em);
    const now = new Date();
    contest.status = payload.status;
    contest.moderationReason =
        payload.status === ContestStatus.PUBLISHED ? null : (payload.reason ?? null);
    contest.moderatedBy = adminUserId;
    contest.moderatedAt = now;
    contest.updatedAt = now;
    await em.flush();

    return toAdminContestRecord(contest, now);
}

export async function deleteContestByAdmin(
    contestId: string,
    adminUserId: string,
    reason: string | undefined,
    em: EntityManager
): Promise<void> {
    const contest = await findActiveContestOrThrow(contestId, em);
    const now = new Date();
    if (reason !== undefined) {
        contest.moderationReason = reason;
    }
    contest.moderatedBy = adminUserId;
    contest.moderatedAt = now;
    contest.deletedAt = now;
    contest.deletedBy = adminUserId;
    contest.updatedAt = now;
    await em.flush();
}
