import { randomBytes } from "node:crypto";
import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";
import { GroupMemberSchema, type GroupMemberEntity } from "../db/entities/group-member.entity";
import { GroupSchema, type GroupEntity } from "../db/entities/group.entity";
import { AppError } from "../shared/errors";
import {
    GroupJoinPolicy,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility,
    type PaginationMeta
} from "../shared/types";
import type {
    CreateGroupDto,
    ListGroupsQueryDto,
    PaginationQueryDto,
    TransferOwnershipDto,
    UpdateGroupSettingsDto
} from "./schemas/group.schema";

export const BCRYPT_SALT_ROUNDS: number = 12;

export interface GroupSummary {
    id: string;
    group_code: string;
    name: string;
    description: string;
    visibility: GroupVisibility;
    join_policy: GroupJoinPolicy;
    owner_id: string;
    status: GroupStatus;
    member_count: number;
    my_role: GroupMemberRole | null;
    created_at: string;
    updated_at: string;
}

export interface PaginatedGroupList {
    items: GroupSummary[];
    pagination: PaginationMeta;
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

export async function findActiveGroupOrThrow(
    groupId: string,
    em: EntityManager
): Promise<GroupEntity> {
    const group: GroupEntity | null = await em.findOne(GroupSchema, {
        id: groupId,
        deletedAt: null
    });
    if (group === null) {
        throw AppError.notFound("GROUP_NOT_FOUND", "Group not found.");
    }
    return group;
}

export function ensureGroupActive(group: GroupEntity): void {
    if (group.status !== GroupStatus.ACTIVE) {
        throw AppError.forbidden("GROUP_SUSPENDED", "Group is currently suspended.");
    }
}

export async function findGroupMembership(
    groupId: string,
    userId: string,
    em: EntityManager
): Promise<GroupMemberEntity | null> {
    return em.findOne(GroupMemberSchema, {
        group: groupId,
        userId
    });
}

export async function requireGroupRole(
    groupId: string,
    userId: string,
    allowedRoles: GroupMemberRole[],
    errorMessage: string,
    em: EntityManager
): Promise<GroupMemberEntity> {
    const membership: GroupMemberEntity | null = await findGroupMembership(groupId, userId, em);
    if (membership === null || !allowedRoles.includes(membership.role)) {
        throw AppError.forbidden("INSUFFICIENT_GROUP_ROLE", errorMessage);
    }
    return membership;
}

export async function softDeleteGroupWithMemberships(
    group: GroupEntity,
    actorId: string,
    em: EntityManager
): Promise<void> {
    const now: Date = new Date();
    group.deletedAt = now;
    group.deletedBy = actorId;
    group.updatedAt = now;
    const members: GroupMemberEntity[] = await em.find(GroupMemberSchema, { group: group.id });
    for (const member of members) {
        em.remove(member);
    }
    await em.flush();
}

async function generateUniqueGroupCode(em: EntityManager): Promise<string> {
    for (let attempt: number = 0; attempt < 5; attempt += 1) {
        const candidate: string = randomBytes(4).toString("hex").toUpperCase();
        const existing: GroupEntity | null = await em.findOne(GroupSchema, {
            groupCode: candidate
        });
        if (existing === null) {
            return candidate;
        }
    }
    return v4().replace(/-/g, "").slice(0, 12).toUpperCase();
}

async function buildGroupSummary(
    group: GroupEntity,
    viewerId: string | undefined,
    em: EntityManager
): Promise<GroupSummary> {
    const memberCount: number = await em.count(GroupMemberSchema, { group: group.id });
    let myRole: GroupMemberRole | null = null;
    if (viewerId !== undefined) {
        const viewerMembership: GroupMemberEntity | null = await findGroupMembership(
            group.id,
            viewerId,
            em
        );
        myRole = viewerMembership ? viewerMembership.role : null;
    }

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
        my_role: myRole,
        created_at: group.createdAt.toISOString(),
        updated_at: group.updatedAt.toISOString()
    };
}

export async function listGroups(
    query: ListGroupsQueryDto,
    viewerId: string | undefined,
    em: EntityManager
): Promise<PaginatedGroupList> {
    const where: FilterQuery<GroupEntity> = {
        deletedAt: null,
        status: GroupStatus.ACTIVE
    };
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

    const items: GroupSummary[] = await Promise.all(
        groups.map((group: GroupEntity): Promise<GroupSummary> =>
            buildGroupSummary(group, viewerId, em)
        )
    );

    return {
        items,
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function listMyGroups(
    userId: string,
    query: PaginationQueryDto,
    em: EntityManager
): Promise<PaginatedGroupList> {
    const memberships: GroupMemberEntity[] = await em.find(
        GroupMemberSchema,
        { userId },
        {
            populate: ["group"],
            orderBy: { joinedAt: "DESC" }
        }
    );
    const activeMemberships: GroupMemberEntity[] = memberships.filter(
        (membership: GroupMemberEntity): boolean => membership.group.deletedAt === null
    );
    const total: number = activeMemberships.length;
    const offset: number = (query.page - 1) * query.limit;
    const pageMemberships: GroupMemberEntity[] = activeMemberships.slice(
        offset,
        offset + query.limit
    );

    const items: GroupSummary[] = await Promise.all(
        pageMemberships.map(async (membership: GroupMemberEntity): Promise<GroupSummary> => {
            const memberCount: number = await em.count(GroupMemberSchema, {
                group: membership.group.id
            });
            return {
                id: membership.group.id,
                group_code: membership.group.groupCode,
                name: membership.group.name,
                description: membership.group.description,
                visibility: membership.group.visibility,
                join_policy: membership.group.joinPolicy,
                owner_id: membership.group.ownerId,
                status: membership.group.status,
                member_count: memberCount,
                my_role: membership.role,
                created_at: membership.group.createdAt.toISOString(),
                updated_at: membership.group.updatedAt.toISOString()
            };
        })
    );

    return {
        items,
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function getGroupByCode(
    groupCode: string,
    viewerId: string | undefined,
    em: EntityManager
): Promise<GroupSummary> {
    const normalizedCode: string = groupCode.trim().toUpperCase();
    const group: GroupEntity | null = await em.findOne(GroupSchema, {
        groupCode: normalizedCode,
        deletedAt: null
    });
    if (group === null) {
        throw AppError.notFound("GROUP_NOT_FOUND", "Group not found.");
    }
    return buildGroupSummary(group, viewerId, em);
}

export async function getGroupById(
    groupId: string,
    viewerId: string | undefined,
    em: EntityManager
): Promise<GroupSummary> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    return buildGroupSummary(group, viewerId, em);
}

export async function createGroup(
    ownerId: string,
    payload: CreateGroupDto,
    em: EntityManager
): Promise<GroupSummary> {
    const groupCode: string = await generateUniqueGroupCode(em);
    const joinPasswordHash: string | null =
        payload.join_policy === GroupJoinPolicy.PASSWORD && payload.password !== undefined
            ? await bcrypt.hash(payload.password, BCRYPT_SALT_ROUNDS)
            : null;

    const group: GroupEntity = em.create(GroupSchema, {
        id: v4(),
        groupCode,
        name: payload.name,
        description: payload.description,
        visibility: payload.visibility,
        joinPolicy: payload.join_policy,
        joinPasswordHash,
        ownerId,
        status: GroupStatus.ACTIVE
    });
    const ownerMembership: GroupMemberEntity = em.create(GroupMemberSchema, {
        group,
        userId: ownerId,
        role: GroupMemberRole.OWNER
    });
    em.persist(group);
    em.persist(ownerMembership);
    await em.flush();

    return buildGroupSummary(group, ownerId, em);
}

export async function updateGroupSettings(
    groupId: string,
    actorId: string,
    payload: UpdateGroupSettingsDto,
    em: EntityManager
): Promise<GroupSummary> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);
    await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.OWNER],
        "Only the group owner can update group settings.",
        em
    );

    const nextVisibility: GroupVisibility = payload.visibility ?? group.visibility;
    const nextJoinPolicy: GroupJoinPolicy = payload.join_policy ?? group.joinPolicy;

    if (
        nextVisibility === GroupVisibility.PUBLIC &&
        nextJoinPolicy !== GroupJoinPolicy.OPEN
    ) {
        throw AppError.badRequest(
            "INVALID_GROUP_POLICY",
            "Public groups must use OPEN join policy."
        );
    }
    if (
        nextVisibility === GroupVisibility.PRIVATE &&
        nextJoinPolicy === GroupJoinPolicy.OPEN
    ) {
        throw AppError.badRequest(
            "INVALID_GROUP_POLICY",
            "Private groups must use APPROVAL or PASSWORD join policy."
        );
    }

    if (nextJoinPolicy === GroupJoinPolicy.PASSWORD) {
        if (payload.password !== undefined) {
            group.joinPasswordHash = await bcrypt.hash(payload.password, BCRYPT_SALT_ROUNDS);
        } else if (group.joinPasswordHash === null) {
            throw AppError.badRequest(
                "PASSWORD_REQUIRED",
                "Password is required when switching to PASSWORD join policy."
            );
        }
    } else {
        if (payload.password !== undefined) {
            throw AppError.badRequest(
                "INVALID_GROUP_POLICY",
                "Password can only be set when join policy is PASSWORD."
            );
        }
        group.joinPasswordHash = null;
    }

    if (payload.name !== undefined) {
        group.name = payload.name;
    }
    if (payload.description !== undefined) {
        group.description = payload.description;
    }
    group.visibility = nextVisibility;
    group.joinPolicy = nextJoinPolicy;
    group.updatedAt = new Date();
    await em.flush();

    return buildGroupSummary(group, actorId, em);
}

export async function transferGroupOwnership(
    groupId: string,
    actorId: string,
    payload: TransferOwnershipDto,
    em: EntityManager
): Promise<GroupSummary> {
    if (payload.new_owner_id === actorId) {
        throw AppError.badRequest(
            "SELF_TRANSFER_NOT_ALLOWED",
            "You already own this group."
        );
    }
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);
    const currentOwnerMembership: GroupMemberEntity = await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.OWNER],
        "Only the group owner can transfer ownership.",
        em
    );
    const nextOwnerMembership: GroupMemberEntity | null = await findGroupMembership(
        group.id,
        payload.new_owner_id,
        em
    );
    if (nextOwnerMembership === null) {
        throw AppError.notFound(
            "MEMBER_NOT_FOUND",
            "Target user must be an existing member of the group."
        );
    }

    const now: Date = new Date();
    currentOwnerMembership.role = GroupMemberRole.MODERATOR;
    currentOwnerMembership.updatedAt = now;
    nextOwnerMembership.role = GroupMemberRole.OWNER;
    nextOwnerMembership.updatedAt = now;
    group.ownerId = payload.new_owner_id;
    group.updatedAt = now;
    await em.flush();

    return buildGroupSummary(group, actorId, em);
}

export async function deleteGroupByOwner(
    groupId: string,
    actorId: string,
    em: EntityManager
): Promise<void> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.OWNER],
        "Only the group owner can delete the group.",
        em
    );
    await softDeleteGroupWithMemberships(group, actorId, em);
}
