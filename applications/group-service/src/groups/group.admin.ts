import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { GroupMemberSchema } from "../db/entities/group-member.entity";
import { GroupSchema, type GroupEntity } from "../db/entities/group.entity";
import { GroupStatus, type PaginatedResult } from "../shared/types";
import {
    buildPaginationMeta,
    findActiveGroupOrThrow,
    softDeleteGroupWithMemberships,
    toGroupBaseRecord,
    type GroupSummary
} from "./group.core";
import type { AdminStatusDto, ListGroupsQuery } from "./schemas/group.schema";

export interface AdminGroupRecord extends Omit<GroupSummary, "my_role"> {
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
}

async function toAdminGroupRecord(
    group: GroupEntity,
    em: EntityManager
): Promise<AdminGroupRecord> {
    const memberCount: number = await em.count(GroupMemberSchema, { group: group.id });
    return {
        ...toGroupBaseRecord(group, memberCount),
        moderation_reason: group.moderationReason ?? null,
        moderated_by: group.moderatedBy ?? null,
        moderated_at: group.moderatedAt ? group.moderatedAt.toISOString() : null
    };
}

export async function listGroupsForAdmin(
    query: ListGroupsQuery,
    em: EntityManager
): Promise<PaginatedResult<AdminGroupRecord>> {
    const where: FilterQuery<GroupEntity> = {
        deletedAt: null
    };
    if (query.status !== undefined) {
        where.status = query.status;
    }
    if (query.visibility !== undefined) {
        where.visibility = query.visibility;
    }
    if (query.search !== undefined && query.search.length > 0) {
        const pattern: string = `%${query.search}%`;
        where.$or = [
            { name: { $ilike: pattern } },
            { description: { $ilike: pattern } },
            { groupCode: { $ilike: pattern } }
        ];
    }

    const offset: number = (query.page - 1) * query.limit;
    const [groups, total]: [GroupEntity[], number] = await em.findAndCount(GroupSchema, where, {
        orderBy: { createdAt: "DESC" },
        limit: query.limit,
        offset
    });

    const items: AdminGroupRecord[] = await Promise.all(
        groups.map((group: GroupEntity): Promise<AdminGroupRecord> => toAdminGroupRecord(group, em))
    );

    return {
        items,
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function getGroupForAdmin(
    groupId: string,
    em: EntityManager
): Promise<AdminGroupRecord> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    return toAdminGroupRecord(group, em);
}

export async function updateGroupStatusByAdmin(
    groupId: string,
    adminUserId: string,
    payload: AdminStatusDto,
    em: EntityManager
): Promise<AdminGroupRecord> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    const now: Date = new Date();
    group.status = payload.status;
    group.moderationReason =
        payload.status === GroupStatus.ACTIVE ? null : (payload.reason ?? null);
    group.moderatedBy = adminUserId;
    group.moderatedAt = now;
    group.updatedAt = now;
    await em.flush();

    return toAdminGroupRecord(group, em);
}

export async function deleteGroupByAdmin(
    groupId: string,
    adminUserId: string,
    reason: string | undefined,
    em: EntityManager
): Promise<void> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    const now: Date = new Date();
    if (reason !== undefined) {
        group.moderationReason = reason;
    }
    group.moderatedBy = adminUserId;
    group.moderatedAt = now;
    await softDeleteGroupWithMemberships(group, adminUserId, em);
}
