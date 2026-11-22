import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { GroupMemberSchema } from "../db/entities/group-member.entity";
import { GroupSchema, type GroupEntity } from "../db/entities/group.entity";
import {
    GroupJoinPolicy,
    GroupStatus,
    GroupVisibility,
    type PaginationMeta
} from "../shared/types";
import {
    buildPaginationMeta,
    findActiveGroupOrThrow,
    softDeleteGroupWithMemberships
} from "./group.core";
import type {
    AdminDeleteGroupDto,
    AdminListGroupsQueryDto,
    AdminUpdateGroupStatusDto
} from "./schemas/group.schema";

export interface AdminGroupRecord {
    id: string;
    group_code: string;
    name: string;
    description: string;
    visibility: GroupVisibility;
    join_policy: GroupJoinPolicy;
    owner_id: string;
    status: GroupStatus;
    member_count: number;
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PaginatedAdminGroups {
    items: AdminGroupRecord[];
    pagination: PaginationMeta;
}

async function toAdminGroupRecord(
    group: GroupEntity,
    em: EntityManager
): Promise<AdminGroupRecord> {
    const memberCount: number = await em.count(GroupMemberSchema, { group: group.id });
    return {
        id: group.id,
        group_code: group.groupCode,
        name: group.name,
        description: group.description,
        visibility: group.visibility,
        join_policy: group.joinPolicy,
        owner_id: group.ownerId,
        status: group.status,
        member_count: memberCount,
        moderation_reason: group.moderationReason ?? null,
        moderated_by: group.moderatedBy ?? null,
        moderated_at: group.moderatedAt ? group.moderatedAt.toISOString() : null,
        created_at: group.createdAt.toISOString(),
        updated_at: group.updatedAt.toISOString()
    };
}

export async function listGroupsForAdmin(
    query: AdminListGroupsQueryDto,
    em: EntityManager
): Promise<PaginatedAdminGroups> {
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
    payload: AdminUpdateGroupStatusDto,
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
    payload: AdminDeleteGroupDto,
    em: EntityManager
): Promise<void> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    const now: Date = new Date();
    if (payload.reason !== undefined) {
        group.moderationReason = payload.reason;
    }
    group.moderatedBy = adminUserId;
    group.moderatedAt = now;
    await softDeleteGroupWithMemberships(group, adminUserId, em);
}
