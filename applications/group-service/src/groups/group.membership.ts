import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";
import { GroupBanSchema, type GroupBanEntity } from "../db/entities/group-ban.entity";
import {
    GroupJoinRequestSchema,
    type GroupJoinRequestEntity
} from "../db/entities/group-join-request.entity";
import { GroupMemberSchema, type GroupMemberEntity } from "../db/entities/group-member.entity";
import type { GroupEntity } from "../db/entities/group.entity";
import { AppError } from "../shared/errors";
import {
    GroupJoinPolicy,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility,
    JoinRequestStatus,
    UserSystemRole,
    type PaginationMeta
} from "../shared/types";
import {
    buildPaginationMeta,
    ensureGroupActive,
    findActiveGroupOrThrow,
    findGroupMembership,
    requireGroupRole
} from "./group.core";
import type {
    BanMemberDto,
    JoinGroupDto,
    ListJoinRequestsQueryDto,
    ListMembersQueryDto,
    PaginationQueryDto,
    ReviewJoinRequestDto,
    UpdateMemberRoleDto
} from "./schemas/group.schema";

export interface GroupMemberRecord {
    group_id: string;
    user_id: string;
    role: GroupMemberRole;
    joined_at: string;
    updated_at: string;
}

export interface PaginatedGroupMembers {
    items: GroupMemberRecord[];
    pagination: PaginationMeta;
}

export interface JoinRequestRecord {
    id: string;
    group_id: string;
    user_id: string;
    status: JoinRequestStatus;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
}

export interface PaginatedJoinRequests {
    items: JoinRequestRecord[];
    pagination: PaginationMeta;
}

export interface GroupBanRecord {
    id: string;
    group_id: string;
    user_id: string;
    reason: string | null;
    banned_by: string;
    banned_at: string;
}

export interface PaginatedGroupBans {
    items: GroupBanRecord[];
    pagination: PaginationMeta;
}

export interface InternalGroupMembership {
    group_id: string;
    user_id: string;
    group_status: GroupStatus;
    visibility: GroupVisibility;
    is_member: boolean;
    is_banned: boolean;
    role: GroupMemberRole | null;
    can_manage: boolean;
    is_owner: boolean;
}

function toMemberRecord(groupId: string, member: GroupMemberEntity): GroupMemberRecord {
    return {
        group_id: groupId,
        user_id: member.userId,
        role: member.role,
        joined_at: member.joinedAt.toISOString(),
        updated_at: member.updatedAt.toISOString()
    };
}

function toJoinRequestRecord(groupId: string, request: GroupJoinRequestEntity): JoinRequestRecord {
    return {
        id: request.id,
        group_id: groupId,
        user_id: request.userId,
        status: request.status,
        reviewed_by: request.reviewedBy ?? null,
        reviewed_at: request.reviewedAt ? request.reviewedAt.toISOString() : null,
        created_at: request.createdAt.toISOString()
    };
}

function toBanRecord(groupId: string, ban: GroupBanEntity): GroupBanRecord {
    return {
        id: ban.id,
        group_id: groupId,
        user_id: ban.userId,
        reason: ban.reason ?? null,
        banned_by: ban.bannedBy,
        banned_at: ban.bannedAt.toISOString()
    };
}

async function findActiveBan(
    groupId: string,
    userId: string,
    em: EntityManager
): Promise<GroupBanEntity | null> {
    return em.findOne(GroupBanSchema, {
        group: groupId,
        userId,
        revokedAt: null
    });
}

async function requireModeratorOrAdminView(
    groupId: string,
    actorId: string,
    actorSystemRole: UserSystemRole | undefined,
    errorMessage: string,
    em: EntityManager
): Promise<void> {
    if (actorSystemRole === UserSystemRole.ADMIN) {
        return;
    }
    await requireGroupRole(
        groupId,
        actorId,
        [GroupMemberRole.MODERATOR, GroupMemberRole.OWNER],
        errorMessage,
        em
    );
}

export async function joinGroup(
    groupId: string,
    userId: string,
    payload: JoinGroupDto,
    em: EntityManager
): Promise<GroupMemberRecord> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);

    const activeBan: GroupBanEntity | null = await findActiveBan(group.id, userId, em);
    if (activeBan !== null) {
        throw AppError.forbidden("USER_BANNED_FROM_GROUP", "You are banned from this group.");
    }

    const existingMember: GroupMemberEntity | null = await findGroupMembership(
        group.id,
        userId,
        em
    );
    if (existingMember !== null) {
        throw AppError.conflict("ALREADY_MEMBER", "You are already a member of this group.");
    }

    if (group.joinPolicy === GroupJoinPolicy.APPROVAL) {
        throw AppError.forbidden(
            "APPROVAL_REQUIRED",
            "This group requires submitting a join request for approval."
        );
    }

    if (group.joinPolicy === GroupJoinPolicy.PASSWORD) {
        if (!payload.password || group.joinPasswordHash === null) {
            throw AppError.forbidden("INVALID_GROUP_PASSWORD", "Invalid group password.");
        }
        const passwordMatches = bcrypt.compare(
            payload.password,
            group.joinPasswordHash!
        );
        if (!passwordMatches) {
            throw AppError.forbidden("INVALID_GROUP_PASSWORD", "Invalid group password.");
        }
    }

    const member: GroupMemberEntity = em.create(GroupMemberSchema, {
        group,
        userId,
        role: GroupMemberRole.MEMBER
    });
    em.persist(member);
    await em.flush();

    return toMemberRecord(group.id, member);
}

export async function requestJoinGroup(
    groupId: string,
    userId: string,
    em: EntityManager
): Promise<JoinRequestRecord> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);

    if (group.joinPolicy !== GroupJoinPolicy.APPROVAL) {
        throw AppError.badRequest(
            "APPROVAL_NOT_REQUIRED",
            "This group does not accept approval join requests."
        );
    }

    const activeBan: GroupBanEntity | null = await findActiveBan(group.id, userId, em);
    if (activeBan !== null) {
        throw AppError.forbidden("USER_BANNED_FROM_GROUP", "You are banned from this group.");
    }

    const existingMember: GroupMemberEntity | null = await findGroupMembership(
        group.id,
        userId,
        em
    );
    if (existingMember !== null) {
        throw AppError.conflict("ALREADY_MEMBER", "You are already a member of this group.");
    }

    const existingPending: GroupJoinRequestEntity | null = await em.findOne(
        GroupJoinRequestSchema,
        {
            group: group.id,
            userId,
            status: JoinRequestStatus.PENDING
        }
    );
    if (existingPending !== null) {
        throw AppError.conflict(
            "JOIN_REQUEST_ALREADY_PENDING",
            "You already have a pending join request for this group."
        );
    }

    const joinRequest: GroupJoinRequestEntity = em.create(GroupJoinRequestSchema, {
        id: v4(),
        group,
        userId,
        status: JoinRequestStatus.PENDING
    });
    em.persist(joinRequest);
    await em.flush();

    return toJoinRequestRecord(group.id, joinRequest);
}

export async function leaveGroup(
    groupId: string,
    userId: string,
    em: EntityManager
): Promise<void> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    if (group.ownerId === userId) {
        throw AppError.forbidden(
            "OWNER_CANNOT_LEAVE",
            "Group owner must transfer ownership or delete the group before leaving."
        );
    }
    const membership: GroupMemberEntity | null = await findGroupMembership(group.id, userId, em);
    if (membership === null) {
        throw AppError.notFound("MEMBER_NOT_FOUND", "You are not a member of this group.");
    }
    em.remove(membership);
    await em.flush();
}

export async function listGroupMembers(
    groupId: string,
    viewerId: string | undefined,
    viewerSystemRole: UserSystemRole | undefined,
    query: ListMembersQueryDto,
    em: EntityManager
): Promise<PaginatedGroupMembers> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    if (
        group.visibility === GroupVisibility.PRIVATE &&
        viewerSystemRole !== UserSystemRole.ADMIN
    ) {
        if (viewerId === undefined) {
            throw AppError.forbidden(
                "GROUP_MEMBERSHIP_REQUIRED",
                "Membership is required to view members of a private group."
            );
        }
        const membership: GroupMemberEntity | null = await findGroupMembership(
            group.id,
            viewerId,
            em
        );
        if (membership === null) {
            throw AppError.forbidden(
                "GROUP_MEMBERSHIP_REQUIRED",
                "Membership is required to view members of a private group."
            );
        }
    }

    const where: FilterQuery<GroupMemberEntity> = {
        group: group.id
    };
    if (query.role !== undefined) {
        where.role = query.role;
    }

    const offset: number = (query.page - 1) * query.limit;
    const [members, total]: [GroupMemberEntity[], number] = await em.findAndCount(
        GroupMemberSchema,
        where,
        {
            orderBy: { joinedAt: "ASC" },
            limit: query.limit,
            offset
        }
    );

    return {
        items: members.map((member: GroupMemberEntity): GroupMemberRecord =>
            toMemberRecord(group.id, member)
        ),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function listJoinRequests(
    groupId: string,
    actorId: string,
    actorSystemRole: UserSystemRole | undefined,
    query: ListJoinRequestsQueryDto,
    em: EntityManager
): Promise<PaginatedJoinRequests> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    await requireModeratorOrAdminView(
        group.id,
        actorId,
        actorSystemRole,
        "Group moderator or owner role is required to view join requests.",
        em
    );

    const where: FilterQuery<GroupJoinRequestEntity> = {
        group: group.id
    };
    if (query.status !== undefined) {
        where.status = query.status;
    }

    const offset: number = (query.page - 1) * query.limit;
    const [requests, total]: [GroupJoinRequestEntity[], number] = await em.findAndCount(
        GroupJoinRequestSchema,
        where,
        {
            orderBy: { createdAt: "DESC" },
            limit: query.limit,
            offset
        }
    );

    return {
        items: requests.map((request: GroupJoinRequestEntity): JoinRequestRecord =>
            toJoinRequestRecord(group.id, request)
        ),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function reviewJoinRequest(
    groupId: string,
    requestId: string,
    actorId: string,
    payload: ReviewJoinRequestDto,
    em: EntityManager
): Promise<JoinRequestRecord> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);
    await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.MODERATOR, GroupMemberRole.OWNER],
        "Group moderator or owner role is required to review join requests.",
        em
    );

    const joinRequest: GroupJoinRequestEntity | null = await em.findOne(GroupJoinRequestSchema, {
        id: requestId,
        group: group.id
    });
    if (joinRequest === null) {
        throw AppError.notFound("JOIN_REQUEST_NOT_FOUND", "Join request not found.");
    }
    if (joinRequest.status !== JoinRequestStatus.PENDING) {
        throw AppError.conflict(
            "JOIN_REQUEST_ALREADY_PROCESSED",
            "Join request has already been processed."
        );
    }

    if (payload.decision === JoinRequestStatus.APPROVED) {
        const activeBan: GroupBanEntity | null = await findActiveBan(
            group.id,
            joinRequest.userId,
            em
        );
        if (activeBan !== null) {
            throw AppError.forbidden(
                "USER_BANNED_FROM_GROUP",
                "Cannot approve request for a banned user."
            );
        }
        const existingMember: GroupMemberEntity | null = await findGroupMembership(
            group.id,
            joinRequest.userId,
            em
        );
        if (existingMember === null) {
            const member: GroupMemberEntity = em.create(GroupMemberSchema, {
                group,
                userId: joinRequest.userId,
                role: GroupMemberRole.MEMBER
            });
            em.persist(member);
        }
    }

    joinRequest.status = payload.decision;
    joinRequest.reviewedBy = actorId;
    joinRequest.reviewedAt = new Date();
    await em.flush();

    return toJoinRequestRecord(group.id, joinRequest);
}

export async function removeGroupMember(
    groupId: string,
    targetUserId: string,
    actorId: string,
    em: EntityManager
): Promise<void> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);
    const actorMembership: GroupMemberEntity = await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.MODERATOR, GroupMemberRole.OWNER],
        "Group moderator or owner role is required to remove members.",
        em
    );

    const targetMembership: GroupMemberEntity | null = await findGroupMembership(
        group.id,
        targetUserId,
        em
    );
    if (targetMembership === null) {
        throw AppError.notFound("MEMBER_NOT_FOUND", "Target user is not a member of this group.");
    }
    if (targetMembership.role === GroupMemberRole.OWNER) {
        throw AppError.forbidden("CANNOT_REMOVE_OWNER", "The group owner cannot be removed.");
    }
    if (
        actorMembership.role === GroupMemberRole.MODERATOR &&
        targetMembership.role === GroupMemberRole.MODERATOR
    ) {
        throw AppError.forbidden(
            "INSUFFICIENT_GROUP_ROLE",
            "Only the group owner can remove a moderator."
        );
    }

    em.remove(targetMembership);
    await em.flush();
}

export async function updateMemberRole(
    groupId: string,
    targetUserId: string,
    actorId: string,
    payload: UpdateMemberRoleDto,
    em: EntityManager
): Promise<GroupMemberRecord> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);
    await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.OWNER],
        "Only the group owner can assign or revoke moderators.",
        em
    );

    const targetMembership: GroupMemberEntity | null = await findGroupMembership(
        group.id,
        targetUserId,
        em
    );
    if (targetMembership === null) {
        throw AppError.notFound("MEMBER_NOT_FOUND", "Target user is not a member of this group.");
    }
    if (targetMembership.role === GroupMemberRole.OWNER) {
        throw AppError.forbidden(
            "CANNOT_CHANGE_OWNER_ROLE",
            "Use ownership transfer to change the group owner."
        );
    }

    targetMembership.role = payload.role;
    targetMembership.updatedAt = new Date();
    await em.flush();

    return toMemberRecord(group.id, targetMembership);
}

export async function banGroupUser(
    groupId: string,
    actorId: string,
    payload: BanMemberDto,
    em: EntityManager
): Promise<GroupBanRecord> {
    if (payload.user_id === actorId) {
        throw AppError.badRequest("SELF_BAN_NOT_ALLOWED", "You cannot ban yourself.");
    }
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);
    const actorMembership: GroupMemberEntity = await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.MODERATOR, GroupMemberRole.OWNER],
        "Group moderator or owner role is required to ban users.",
        em
    );

    const targetMembership: GroupMemberEntity | null = await findGroupMembership(
        group.id,
        payload.user_id,
        em
    );
    if (targetMembership !== null) {
        if (targetMembership.role === GroupMemberRole.OWNER) {
            throw AppError.forbidden("CANNOT_BAN_OWNER", "The group owner cannot be banned.");
        }
        if (
            actorMembership.role === GroupMemberRole.MODERATOR &&
            targetMembership.role === GroupMemberRole.MODERATOR
        ) {
            throw AppError.forbidden(
                "INSUFFICIENT_GROUP_ROLE",
                "Only the group owner can ban a moderator."
            );
        }
    }

    const existingBan: GroupBanEntity | null = await findActiveBan(
        group.id,
        payload.user_id,
        em
    );
    if (existingBan !== null) {
        throw AppError.conflict("USER_ALREADY_BANNED", "User is already banned from this group.");
    }

    if (targetMembership !== null) {
        em.remove(targetMembership);
    }

    const pendingRequests: GroupJoinRequestEntity[] = await em.find(GroupJoinRequestSchema, {
        group: group.id,
        userId: payload.user_id,
        status: JoinRequestStatus.PENDING
    });
    const now: Date = new Date();
    for (const pendingRequest of pendingRequests) {
        pendingRequest.status = JoinRequestStatus.REJECTED;
        pendingRequest.reviewedBy = actorId;
        pendingRequest.reviewedAt = now;
    }

    const banRecord: GroupBanEntity = em.create(GroupBanSchema, {
        id: v4(),
        group,
        userId: payload.user_id,
        reason: payload.reason ?? null,
        bannedBy: actorId,
        bannedAt: now
    });
    em.persist(banRecord);
    await em.flush();

    return toBanRecord(group.id, banRecord);
}

export async function listGroupBans(
    groupId: string,
    actorId: string,
    actorSystemRole: UserSystemRole | undefined,
    query: PaginationQueryDto,
    em: EntityManager
): Promise<PaginatedGroupBans> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    await requireModeratorOrAdminView(
        group.id,
        actorId,
        actorSystemRole,
        "Group moderator or owner role is required to view banned users.",
        em
    );

    const offset: number = (query.page - 1) * query.limit;
    const [bans, total]: [GroupBanEntity[], number] = await em.findAndCount(
        GroupBanSchema,
        {
            group: group.id,
            revokedAt: null
        },
        {
            orderBy: { bannedAt: "DESC" },
            limit: query.limit,
            offset
        }
    );

    return {
        items: bans.map((ban: GroupBanEntity): GroupBanRecord => toBanRecord(group.id, ban)),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function unbanGroupUser(
    groupId: string,
    targetUserId: string,
    actorId: string,
    em: EntityManager
): Promise<void> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    ensureGroupActive(group);
    await requireGroupRole(
        group.id,
        actorId,
        [GroupMemberRole.MODERATOR, GroupMemberRole.OWNER],
        "Group moderator or owner role is required to unban users.",
        em
    );

    const activeBan: GroupBanEntity | null = await findActiveBan(group.id, targetUserId, em);
    if (activeBan === null) {
        throw AppError.notFound("BAN_NOT_FOUND", "Active ban not found for this user.");
    }
    activeBan.revokedAt = new Date();
    await em.flush();
}

export async function getInternalMembership(
    groupId: string,
    userId: string,
    em: EntityManager
): Promise<InternalGroupMembership> {
    const group: GroupEntity = await findActiveGroupOrThrow(groupId, em);
    const membership: GroupMemberEntity | null = await findGroupMembership(group.id, userId, em);
    const activeBan: GroupBanEntity | null = await findActiveBan(group.id, userId, em);
    const role: GroupMemberRole | null = membership ? membership.role : null;

    return {
        group_id: group.id,
        user_id: userId,
        group_status: group.status,
        visibility: group.visibility,
        is_member: membership !== null,
        is_banned: activeBan !== null,
        role,
        can_manage:
            role === GroupMemberRole.MODERATOR || role === GroupMemberRole.OWNER,
        is_owner: role === GroupMemberRole.OWNER
    };
}
