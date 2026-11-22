import type { EntityManager } from "@mikro-orm/postgresql";
import { hashPassword, verifyPassword } from "../auth/auth.token";
import { UserFollowSchema, type UserFollowEntity } from "../db/entities/user-follow.entity";
import {
    UserOAuthAccountSchema,
    type UserOAuthAccountEntity
} from "../db/entities/user-oauth-account.entity";
import { UserSchema, type UserEntity } from "../db/entities/user.entity";
import { AppError } from "../shared/errors";
import {
    OAuthProvider,
    UserStatus,
    UserSystemRole,
    type PaginationMeta
} from "../shared/types";
import type { ChangePasswordDto, UpdateProfileDto } from "./schemas/user.schema";

export interface PrivacySettings {
    show_email: boolean;
    show_bio: boolean;
    show_followers: boolean;
    show_following: boolean;
}

export interface OwnUserProfile {
    id: string;
    email: string;
    username: string;
    display_name: string;
    bio: string | null;
    avatar_url: string | null;
    privacy_settings: PrivacySettings;
    has_password: boolean;
    linked_providers: OAuthProvider[];
    system_role: UserSystemRole;
    status: UserStatus;
    followers_count: number;
    following_count: number;
    created_at: string;
    updated_at: string;
}

export interface PublicUserProfile {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    email: string | null;
    status: UserStatus;
    restricted: boolean;
    followers_count: number | null;
    following_count: number | null;
    is_following: boolean;
    created_at: string;
}

export interface InternalUserSummary {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    system_role: UserSystemRole;
    status: UserStatus;
}

export function normalizePrivacySettings(raw: Record<string, unknown>): PrivacySettings {
    return {
        show_email: typeof raw.show_email === "boolean" ? raw.show_email : false,
        show_bio: typeof raw.show_bio === "boolean" ? raw.show_bio : true,
        show_followers: typeof raw.show_followers === "boolean" ? raw.show_followers : true,
        show_following: typeof raw.show_following === "boolean" ? raw.show_following : true
    };
}

export async function findUserByIdOrThrow(
    userId: string,
    em: EntityManager
): Promise<UserEntity> {
    const user: UserEntity | null = await em.findOne(UserSchema, {
        id: userId,
        deletedAt: null
    });
    if (user === null) {
        throw AppError.notFound("USER_NOT_FOUND", "User not found.");
    }
    return user;
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

export async function getOwnProfile(
    userId: string,
    em: EntityManager
): Promise<OwnUserProfile> {
    const user: UserEntity = await findUserByIdOrThrow(userId, em);
    const oauthAccounts: UserOAuthAccountEntity[] = await em.find(UserOAuthAccountSchema, {
        user: user.id
    });
    const linkedProviders: OAuthProvider[] = oauthAccounts.map(
        (account: UserOAuthAccountEntity): OAuthProvider => account.provider
    );
    const followersCount: number = await em.count(UserFollowSchema, { followee: user.id });
    const followingCount: number = await em.count(UserFollowSchema, { follower: user.id });

    return {
        id: user.id,
        email: user.email,
        username: user.username,
        display_name: user.displayName,
        bio: user.bio ?? null,
        avatar_url: user.avatarUrl ?? null,
        privacy_settings: normalizePrivacySettings(user.privacySettings),
        has_password: user.passwordHash !== null,
        linked_providers: linkedProviders,
        system_role: user.systemRole,
        status: user.status,
        followers_count: followersCount,
        following_count: followingCount,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString()
    };
}

export async function updateOwnProfile(
    userId: string,
    payload: UpdateProfileDto,
    em: EntityManager
): Promise<OwnUserProfile> {
    const user: UserEntity = await findUserByIdOrThrow(userId, em);
    if (payload.username !== undefined && payload.username !== user.username) {
        const existingUser: UserEntity | null = await em.findOne(UserSchema, {
            username: payload.username
        });
        if (existingUser !== null && existingUser.id !== user.id) {
            throw AppError.conflict("USERNAME_CONFLICT", "Username is already taken.");
        }
        user.username = payload.username;
    }
    if (payload.display_name !== undefined) {
        user.displayName = payload.display_name;
    }
    if (payload.bio !== undefined) {
        user.bio = payload.bio;
    }
    if (payload.avatar_url !== undefined) {
        user.avatarUrl = payload.avatar_url;
    }
    if (payload.privacy_settings !== undefined) {
        user.privacySettings = {
            ...normalizePrivacySettings(user.privacySettings),
            ...payload.privacy_settings
        };
    }
    user.updatedAt = new Date();
    await em.flush();
    return getOwnProfile(user.id, em);
}

export async function changeOwnPassword(
    userId: string,
    payload: ChangePasswordDto,
    em: EntityManager
): Promise<void> {
    const user: UserEntity = await findUserByIdOrThrow(userId, em);
    if (user.passwordHash === null) {
        throw AppError.badRequest(
            "PASSWORD_NOT_SET",
            "Password change is only available for accounts with a local password."
        );
    }
    const matchesCurrent: boolean = await verifyPassword(
        payload.current_password,
        user.passwordHash
    );
    if (!matchesCurrent) {
        throw AppError.badRequest("INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
    }
    if (payload.current_password === payload.new_password) {
        throw AppError.badRequest(
            "SAME_PASSWORD",
            "New password must differ from current password."
        );
    }
    user.passwordHash = await hashPassword(payload.new_password);
    user.updatedAt = new Date();
    await em.flush();
}

async function buildPublicProfile(
    user: UserEntity,
    viewerId: string | undefined,
    em: EntityManager
): Promise<PublicUserProfile> {
    if (user.status === UserStatus.BANNED) {
        return {
            id: user.id,
            username: user.username,
            display_name: user.displayName,
            avatar_url: null,
            bio: null,
            email: null,
            status: UserStatus.BANNED,
            restricted: true,
            followers_count: null,
            following_count: null,
            is_following: false,
            created_at: user.createdAt.toISOString()
        };
    }
    const privacy: PrivacySettings = normalizePrivacySettings(user.privacySettings);
    const followersCount: number | null = privacy.show_followers
        ? await em.count(UserFollowSchema, { followee: user.id })
        : null;
    const followingCount: number | null = privacy.show_following
        ? await em.count(UserFollowSchema, { follower: user.id })
        : null;
    let isFollowing: boolean = false;
    if (viewerId !== undefined && viewerId !== user.id) {
        const followRecord: UserFollowEntity | null = await em.findOne(UserFollowSchema, {
            follower: viewerId,
            followee: user.id
        });
        isFollowing = followRecord !== null;
    }

    return {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl ?? null,
        bio: privacy.show_bio ? (user.bio ?? null) : null,
        email: privacy.show_email ? user.email : null,
        status: user.status,
        restricted: false,
        followers_count: followersCount,
        following_count: followingCount,
        is_following: isFollowing,
        created_at: user.createdAt.toISOString()
    };
}

export async function getPublicProfileById(
    targetUserId: string,
    viewerId: string | undefined,
    em: EntityManager
): Promise<PublicUserProfile> {
    const user: UserEntity = await findUserByIdOrThrow(targetUserId, em);
    return buildPublicProfile(user, viewerId, em);
}

export async function getPublicProfileByUsername(
    username: string,
    viewerId: string | undefined,
    em: EntityManager
): Promise<PublicUserProfile> {
    const user: UserEntity | null = await em.findOne(UserSchema, {
        username,
        deletedAt: null
    });
    if (user === null) {
        throw AppError.notFound("USER_NOT_FOUND", "User not found.");
    }
    return buildPublicProfile(user, viewerId, em);
}

export async function getUsersBatch(
    userIds: string[],
    em: EntityManager
): Promise<InternalUserSummary[]> {
    const uniqueIds: string[] = Array.from(new Set<string>(userIds));
    const users: UserEntity[] = await em.find(UserSchema, {
        id: { $in: uniqueIds },
        deletedAt: null
    });
    return users.map(
        (user: UserEntity): InternalUserSummary => ({
            id: user.id,
            username: user.username,
            display_name: user.displayName,
            avatar_url: user.avatarUrl ?? null,
            system_role: user.systemRole,
            status: user.status
        })
    );
}
