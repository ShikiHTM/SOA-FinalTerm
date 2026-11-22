import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono, type Context } from "hono";
import { AppError } from "../shared/errors";
import {
    createZodValidator,
    optionalAuthenticatedHeaders,
    requireAuthenticatedHeaders
} from "../shared/middleware";
import type { AppEnv, UserSystemRole } from "../shared/types";
import {
    BatchUsersRequestSchema,
    ChangePasswordSchema,
    PaginationQuerySchema,
    UpdateProfileSchema,
    UserIdParamSchema,
    UsernameParamSchema,
    type BatchUsersRequestDto,
    type ChangePasswordDto,
    type PaginationQueryDto,
    type UpdateProfileDto,
    type UserIdParamDto,
    type UsernameParamDto
} from "./schemas/user.schema";
import {
    followUser,
    listFollowers,
    listFollowing,
    unfollowUser,
    type FollowActionResponse,
    type PaginatedFollowList
} from "./user.follow";
import {
    changeOwnPassword,
    getOwnProfile,
    getPublicProfileById,
    getPublicProfileByUsername,
    getUsersBatch,
    updateOwnProfile,
    type InternalUserSummary,
    type OwnUserProfile,
    type PublicUserProfile
} from "./user.profile";

function getAuthenticatedUserId(c: Context<AppEnv>): string {
    const userId: string | undefined = c.get("userId");
    if (!userId) {
        throw AppError.unauthorized("UNAUTHORIZED", "Authenticated user ID is missing.");
    }
    return userId;
}

export function createUserRoute(): Hono<AppEnv> {
    const router: Hono<AppEnv> = new Hono<AppEnv>();

    router.get("/me", requireAuthenticatedHeaders, async (c): Promise<Response> => {
        const userId: string = getAuthenticatedUserId(c);
        const em: EntityManager = c.get("em");
        const profile: OwnUserProfile = await getOwnProfile(userId, em);
        return c.json(profile, 200);
    });

    router.patch(
        "/me",
        requireAuthenticatedHeaders,
        createZodValidator("json", UpdateProfileSchema),
        async (c): Promise<Response> => {
            const userId: string = getAuthenticatedUserId(c);
            const payload: UpdateProfileDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const profile: OwnUserProfile = await updateOwnProfile(userId, payload, em);
            return c.json(profile, 200);
        }
    );

    router.put(
        "/me/password",
        requireAuthenticatedHeaders,
        createZodValidator("json", ChangePasswordSchema),
        async (c): Promise<Response> => {
            const userId: string = getAuthenticatedUserId(c);
            const payload: ChangePasswordDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            await changeOwnPassword(userId, payload, em);
            return c.body(null, 204);
        }
    );

    router.post(
        "/batch",
        createZodValidator("json", BatchUsersRequestSchema),
        async (c): Promise<Response> => {
            const payload: BatchUsersRequestDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const users: InternalUserSummary[] = await getUsersBatch(payload.user_ids, em);
            return c.json({ users }, 200);
        }
    );

    router.get(
        "/username/:username",
        optionalAuthenticatedHeaders,
        createZodValidator("param", UsernameParamSchema),
        async (c): Promise<Response> => {
            const params: UsernameParamDto = c.req.valid("param");
            const viewerId: string | undefined = c.get("userId");
            const em: EntityManager = c.get("em");
            const profile: PublicUserProfile = await getPublicProfileByUsername(
                params.username,
                viewerId,
                em
            );
            return c.json(profile, 200);
        }
    );

    router.get(
        "/:id",
        optionalAuthenticatedHeaders,
        createZodValidator("param", UserIdParamSchema),
        async (c): Promise<Response> => {
            const params: UserIdParamDto = c.req.valid("param");
            const viewerId: string | undefined = c.get("userId");
            const em: EntityManager = c.get("em");
            const profile: PublicUserProfile = await getPublicProfileById(params.id, viewerId, em);
            return c.json(profile, 200);
        }
    );

    router.post(
        "/:id/follow",
        requireAuthenticatedHeaders,
        createZodValidator("param", UserIdParamSchema),
        async (c): Promise<Response> => {
            const followerId: string = getAuthenticatedUserId(c);
            const params: UserIdParamDto = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: FollowActionResponse = await followUser(followerId, params.id, em);
            return c.json(result, 200);
        }
    );

    router.delete(
        "/:id/follow",
        requireAuthenticatedHeaders,
        createZodValidator("param", UserIdParamSchema),
        async (c): Promise<Response> => {
            const followerId: string = getAuthenticatedUserId(c);
            const params: UserIdParamDto = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: FollowActionResponse = await unfollowUser(followerId, params.id, em);
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id/followers",
        optionalAuthenticatedHeaders,
        createZodValidator("param", UserIdParamSchema),
        createZodValidator("query", PaginationQuerySchema),
        async (c): Promise<Response> => {
            const params: UserIdParamDto = c.req.valid("param");
            const query: PaginationQueryDto = c.req.valid("query");
            const viewerId: string | undefined = c.get("userId");
            const viewerRole: UserSystemRole | undefined = c.get("userRole");
            const em: EntityManager = c.get("em");
            const result: PaginatedFollowList = await listFollowers(
                params.id,
                viewerId,
                viewerRole,
                query,
                em
            );
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id/following",
        optionalAuthenticatedHeaders,
        createZodValidator("param", UserIdParamSchema),
        createZodValidator("query", PaginationQuerySchema),
        async (c): Promise<Response> => {
            const params: UserIdParamDto = c.req.valid("param");
            const query: PaginationQueryDto = c.req.valid("query");
            const viewerId: string | undefined = c.get("userId");
            const viewerRole: UserSystemRole | undefined = c.get("userRole");
            const em: EntityManager = c.get("em");
            const result: PaginatedFollowList = await listFollowing(
                params.id,
                viewerId,
                viewerRole,
                query,
                em
            );
            return c.json(result, 200);
        }
    );

    return router;
}
