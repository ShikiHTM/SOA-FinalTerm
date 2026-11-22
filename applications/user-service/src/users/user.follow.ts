import type { EntityManager } from "@mikro-orm/postgresql";
import { UserFollowSchema, type UserFollowEntity } from "../db/entities/user-follow.entity";
import type { UserEntity } from "../db/entities/user.entity";
import { AppError } from "../shared/errors";
import { UserStatus, UserSystemRole, type PaginatedResult } from "../shared/types";
import type { PaginationQuery } from "./schemas/user.schema";
import {
    buildPaginationMeta,
    findUserByIdOrThrow,
    normalizePrivacySettings,
    type PrivacySettings
} from "./user.profile";

export interface FollowActionResponse {
    following: boolean;
    followers_count: number;
}

export interface UserFollowItem {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    followed_at: string;
}

export async function followUser(
    followerId: string,
    targetUserId: string,
    em: EntityManager
): Promise<FollowActionResponse> {
    if (followerId === targetUserId) {
        throw AppError.badRequest("SELF_FOLLOW_NOT_ALLOWED", "You cannot follow yourself.");
    }
    const follower: UserEntity = await findUserByIdOrThrow(followerId, em);
    const target: UserEntity = await findUserByIdOrThrow(targetUserId, em);
    if (target.status !== UserStatus.ACTIVE) {
        throw AppError.forbidden("TARGET_USER_UNAVAILABLE", "Target user account is not available.");
    }
    const existing: UserFollowEntity | null = await em.findOne(UserFollowSchema, {
        follower: follower.id,
        followee: target.id
    });
    if (existing === null) {
        const follow: UserFollowEntity = em.create(UserFollowSchema, {
            follower,
            followee: target
        });
        em.persist(follow);
        await em.flush();
    }
    const followersCount: number = await em.count(UserFollowSchema, { followee: target.id });
    return {
        following: true,
        followers_count: followersCount
    };
}

export async function unfollowUser(
    followerId: string,
    targetUserId: string,
    em: EntityManager
): Promise<FollowActionResponse> {
    const target: UserEntity = await findUserByIdOrThrow(targetUserId, em);
    const existing: UserFollowEntity | null = await em.findOne(UserFollowSchema, {
        follower: followerId,
        followee: target.id
    });
    if (existing !== null) {
        em.remove(existing);
        await em.flush();
    }
    const followersCount: number = await em.count(UserFollowSchema, { followee: target.id });
    return {
        following: false,
        followers_count: followersCount
    };
}

async function listFollowRelation(
    targetUserId: string,
    direction: "followers" | "following",
    viewerId: string | undefined,
    viewerRole: UserSystemRole | undefined,
    query: PaginationQuery,
    em: EntityManager
): Promise<PaginatedResult<UserFollowItem>> {
    const target: UserEntity = await findUserByIdOrThrow(targetUserId, em);
    const privacy: PrivacySettings = normalizePrivacySettings(target.privacySettings);
    const isOwnerOrAdmin: boolean =
        viewerId === targetUserId || viewerRole === UserSystemRole.ADMIN;
    const isAllowed: boolean =
        direction === "followers" ? privacy.show_followers : privacy.show_following;

    if (!isOwnerOrAdmin && (target.status === UserStatus.BANNED || !isAllowed)) {
        throw AppError.forbidden(
            "PROFILE_FIELD_RESTRICTED",
            direction === "followers"
                ? "User followers list is restricted."
                : "User following list is restricted."
        );
    }

    const offset: number = (query.page - 1) * query.limit;
    const whereClause: { followee?: string; follower?: string } =
        direction === "followers" ? { followee: targetUserId } : { follower: targetUserId };
    const populateField: "follower" | "followee" =
        direction === "followers" ? "follower" : "followee";

    const [records, total]: [UserFollowEntity[], number] = await em.findAndCount(
        UserFollowSchema,
        whereClause,
        {
            populate: [populateField],
            orderBy: { createdAt: "DESC" },
            limit: query.limit,
            offset
        }
    );

    const items: UserFollowItem[] = records.map((record: UserFollowEntity): UserFollowItem => {
        const relatedUser: UserEntity =
            direction === "followers" ? record.follower : record.followee;
        return {
            id: relatedUser.id,
            username: relatedUser.username,
            display_name: relatedUser.displayName,
            avatar_url: relatedUser.avatarUrl ?? null,
            followed_at: record.createdAt.toISOString()
        };
    });

    return {
        items,
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function listFollowers(
    targetUserId: string,
    viewerId: string | undefined,
    viewerRole: UserSystemRole | undefined,
    query: PaginationQuery,
    em: EntityManager
): Promise<PaginatedResult<UserFollowItem>> {
    return listFollowRelation(targetUserId, "followers", viewerId, viewerRole, query, em);
}

export async function listFollowing(
    targetUserId: string,
    viewerId: string | undefined,
    viewerRole: UserSystemRole | undefined,
    query: PaginationQuery,
    em: EntityManager
): Promise<PaginatedResult<UserFollowItem>> {
    return listFollowRelation(targetUserId, "following", viewerId, viewerRole, query, em);
}
