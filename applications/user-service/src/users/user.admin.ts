import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { revokeAllUserTokens, toAuthUserSummary } from "../auth/auth.token";
import { UserSchema, type UserEntity } from "../db/entities/user.entity";
import { AppError } from "../shared/errors";
import {
    UserStatus,
    UserSystemRole,
    type AuthUserSummary,
    type PaginatedResult
} from "../shared/types";
import type { ListUsersQuery, UpdateUserStatusDto } from "./schemas/user.schema";
import { buildPaginationMeta, findUserByIdOrThrow } from "./user.profile";

export interface AdminUserRecord extends AuthUserSummary {
    bio: string | null;
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
    created_at: string;
    updated_at: string;
}

function toAdminUserRecord(user: UserEntity): AdminUserRecord {
    return {
        ...toAuthUserSummary(user),
        bio: user.bio ?? null,
        moderation_reason: user.moderationReason ?? null,
        moderated_by: user.moderatedBy ?? null,
        moderated_at: user.moderatedAt ? user.moderatedAt.toISOString() : null,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString()
    };
}

export async function listUsersForAdmin(
    query: ListUsersQuery,
    em: EntityManager
): Promise<PaginatedResult<AdminUserRecord>> {
    const where: FilterQuery<UserEntity> = {
        deletedAt: null
    };
    if (query.status !== undefined) {
        where.status = query.status;
    }
    if (query.role !== undefined) {
        where.systemRole = query.role;
    }
    if (query.search !== undefined && query.search.length > 0) {
        const pattern: string = `%${query.search}%`;
        where.$or = [
            { email: { $ilike: pattern } },
            { username: { $ilike: pattern } },
            { displayName: { $ilike: pattern } }
        ];
    }

    const offset: number = (query.page - 1) * query.limit;
    const [users, total]: [UserEntity[], number] = await em.findAndCount(UserSchema, where, {
        orderBy: { createdAt: "DESC" },
        limit: query.limit,
        offset
    });

    return {
        items: users.map(toAdminUserRecord),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function getUserForAdmin(
    targetUserId: string,
    em: EntityManager
): Promise<AdminUserRecord> {
    const user: UserEntity = await findUserByIdOrThrow(targetUserId, em);
    return toAdminUserRecord(user);
}

export async function updateUserStatus(
    targetUserId: string,
    adminUserId: string,
    payload: UpdateUserStatusDto,
    em: EntityManager
): Promise<AdminUserRecord> {
    if (targetUserId === adminUserId) {
        throw AppError.forbidden(
            "SELF_MODERATION_NOT_ALLOWED",
            "Administrators cannot suspend or ban their own account."
        );
    }
    const user: UserEntity = await findUserByIdOrThrow(targetUserId, em);
    const now: Date = new Date();
    user.status = payload.status;
    user.moderationReason = payload.status === UserStatus.ACTIVE ? null : (payload.reason ?? null);
    user.moderatedBy = adminUserId;
    user.moderatedAt = now;
    user.updatedAt = now;
    await em.flush();

    if (payload.status !== UserStatus.ACTIVE) {
        await revokeAllUserTokens(user.id, em);
    }

    return toAdminUserRecord(user);
}

export async function updateUserRole(
    targetUserId: string,
    adminUserId: string,
    systemRole: UserSystemRole,
    em: EntityManager
): Promise<AdminUserRecord> {
    if (targetUserId === adminUserId) {
        throw AppError.forbidden(
            "SELF_ROLE_CHANGE_NOT_ALLOWED",
            "Administrators cannot change their own system role."
        );
    }
    const user: UserEntity = await findUserByIdOrThrow(targetUserId, em);
    user.systemRole = systemRole;
    user.updatedAt = new Date();
    await em.flush();
    await revokeAllUserTokens(user.id, em);

    return toAdminUserRecord(user);
}
