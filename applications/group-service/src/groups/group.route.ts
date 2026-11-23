import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono, type Context } from "hono";
import { AppError } from "../shared/errors";
import { lmsGroupEventsTotal } from "../shared/metrics";
import {
    createZodValidator,
    optionalAuthenticatedHeaders,
    parseOptionalJsonBody,
    requireAuthenticatedHeaders
} from "../shared/middleware";
import {
    JoinRequestStatus,
    type AppEnv,
    type GroupMemberRole,
    type PaginatedResult,
    type UserSystemRole
} from "../shared/types";
import {
    createGroup,
    deleteGroupByOwner,
    getGroupByCode,
    getGroupById,
    listGroups,
    listMyGroups,
    transferGroupOwnership,
    updateGroupSettings,
    type GroupSummary
} from "./group.core";
import {
    banGroupUser,
    getInternalMembership,
    joinGroup,
    leaveGroup,
    listGroupBans,
    listGroupMembers,
    listJoinRequests,
    removeGroupMember,
    requestJoinGroup,
    reviewJoinRequest,
    unbanGroupUser,
    updateMemberRole,
    type GroupBanRecord,
    type GroupMemberRecord,
    type InternalGroupMembership,
    type JoinRequestRecord
} from "./group.membership";
import {
    BanMemberSchema,
    CreateGroupSchema,
    GroupCodeParamSchema,
    GroupRequestParamSchema,
    GroupUserParamSchema,
    IdParamSchema,
    JoinGroupSchema,
    ListGroupsQuerySchema,
    ListJoinRequestsQuerySchema,
    ListMembersQuerySchema,
    PaginationQuerySchema,
    ReviewJoinRequestSchema,
    TransferOwnershipSchema,
    UpdateGroupSettingsSchema,
    UpdateMemberRoleSchema,
    type BanMemberDto,
    type CreateGroupDto,
    type ListGroupsQuery,
    type ListJoinRequestsQuery,
    type ListMembersQuery,
    type PaginationQuery,
    type UpdateGroupSettingsDto
} from "./schemas/group.schema";

function getAuthenticatedUserId(c: Context<AppEnv>): string {
    const userId: string | undefined = c.get("userId");
    if (!userId) {
        throw AppError.unauthorized("UNAUTHORIZED", "Authenticated user ID is missing.");
    }
    return userId;
}

export function createGroupRoute(): Hono<AppEnv> {
    const router: Hono<AppEnv> = new Hono<AppEnv>();

    router.get(
        "/",
        optionalAuthenticatedHeaders,
        createZodValidator("query", ListGroupsQuerySchema),
        async (c): Promise<Response> => {
            const query: ListGroupsQuery = c.req.valid("query");
            const viewerId: string | undefined = c.get("userId");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<GroupSummary> = await listGroups(query, viewerId, em);
            return c.json(result, 200);
        }
    );

    router.post(
        "/",
        requireAuthenticatedHeaders,
        createZodValidator("json", CreateGroupSchema),
        async (c): Promise<Response> => {
            const ownerId: string = getAuthenticatedUserId(c);
            const payload: CreateGroupDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: GroupSummary = await createGroup(ownerId, payload, em);
            lmsGroupEventsTotal.inc({ action: "created" });
            return c.json(result, 201);
        }
    );

    router.get(
        "/me",
        requireAuthenticatedHeaders,
        createZodValidator("query", PaginationQuerySchema),
        async (c): Promise<Response> => {
            const userId: string = getAuthenticatedUserId(c);
            const query: PaginationQuery = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<GroupSummary> = await listMyGroups(userId, query, em);
            return c.json(result, 200);
        }
    );

    router.get(
        "/code/:code",
        optionalAuthenticatedHeaders,
        createZodValidator("param", GroupCodeParamSchema),
        async (c): Promise<Response> => {
            const params: { code: string } = c.req.valid("param");
            const viewerId: string | undefined = c.get("userId");
            const em: EntityManager = c.get("em");
            const result: GroupSummary = await getGroupByCode(params.code, viewerId, em);
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id",
        optionalAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const params: { id: string } = c.req.valid("param");
            const viewerId: string | undefined = c.get("userId");
            const em: EntityManager = c.get("em");
            const result: GroupSummary = await getGroupById(params.id, viewerId, em);
            return c.json(result, 200);
        }
    );

    router.patch(
        "/:id",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", UpdateGroupSettingsSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: UpdateGroupSettingsDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: GroupSummary = await updateGroupSettings(params.id, actorId, payload, em);
            return c.json(result, 200);
        }
    );

    router.delete(
        "/:id",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            await deleteGroupByOwner(params.id, actorId, em);
            lmsGroupEventsTotal.inc({ action: "deleted" });
            return c.body(null, 204);
        }
    );

    router.post(
        "/:id/transfer-ownership",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", TransferOwnershipSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: { new_owner_id: string } = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: GroupSummary = await transferGroupOwnership(
                params.id,
                actorId,
                payload.new_owner_id,
                em
            );
            return c.json(result, 200);
        }
    );

    router.post(
        "/:id/join",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const userId: string = getAuthenticatedUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: { password?: string } = await parseOptionalJsonBody(c, JoinGroupSchema);
            const em: EntityManager = c.get("em");
            const result: GroupMemberRecord = await joinGroup(
                params.id,
                userId,
                payload.password,
                em
            );
            lmsGroupEventsTotal.inc({ action: "joined" });
            return c.json(result, 201);
        }
    );

    router.post(
        "/:id/leave",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const userId: string = getAuthenticatedUserId(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            await leaveGroup(params.id, userId, em);
            lmsGroupEventsTotal.inc({ action: "left" });
            return c.body(null, 204);
        }
    );

    router.post(
        "/:id/requests",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const userId: string = getAuthenticatedUserId(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: JoinRequestRecord = await requestJoinGroup(params.id, userId, em);
            lmsGroupEventsTotal.inc({ action: "join_requested" });
            return c.json(result, 201);
        }
    );

    router.get(
        "/:id/requests",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("query", ListJoinRequestsQuerySchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const actorRole: UserSystemRole | undefined = c.get("userRole");
            const params: { id: string } = c.req.valid("param");
            const query: ListJoinRequestsQuery = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<JoinRequestRecord> = await listJoinRequests(
                params.id,
                actorId,
                actorRole,
                query,
                em
            );
            return c.json(result, 200);
        }
    );

    router.patch(
        "/:id/requests/:requestId",
        requireAuthenticatedHeaders,
        createZodValidator("param", GroupRequestParamSchema),
        createZodValidator("json", ReviewJoinRequestSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string; requestId: string } = c.req.valid("param");
            const payload: {
                decision: JoinRequestStatus.APPROVED | JoinRequestStatus.REJECTED;
            } = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: JoinRequestRecord = await reviewJoinRequest(
                params.id,
                params.requestId,
                actorId,
                payload.decision,
                em
            );
            lmsGroupEventsTotal.inc({
                action:
                    payload.decision === JoinRequestStatus.APPROVED
                        ? "join_approved"
                        : "join_rejected"
            });
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id/members",
        optionalAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("query", ListMembersQuerySchema),
        async (c): Promise<Response> => {
            const params: { id: string } = c.req.valid("param");
            const query: ListMembersQuery = c.req.valid("query");
            const viewerId: string | undefined = c.get("userId");
            const viewerRole: UserSystemRole | undefined = c.get("userRole");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<GroupMemberRecord> = await listGroupMembers(
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
        "/:id/members/:userId",
        createZodValidator("param", GroupUserParamSchema),
        async (c): Promise<Response> => {
            const params: { id: string; userId: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: InternalGroupMembership = await getInternalMembership(
                params.id,
                params.userId,
                em
            );
            return c.json(result, 200);
        }
    );

    router.patch(
        "/:id/members/:userId/role",
        requireAuthenticatedHeaders,
        createZodValidator("param", GroupUserParamSchema),
        createZodValidator("json", UpdateMemberRoleSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string; userId: string } = c.req.valid("param");
            const payload: {
                role: GroupMemberRole.MEMBER | GroupMemberRole.MODERATOR;
            } = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: GroupMemberRecord = await updateMemberRole(
                params.id,
                params.userId,
                actorId,
                payload.role,
                em
            );
            return c.json(result, 200);
        }
    );

    router.delete(
        "/:id/members/:userId",
        requireAuthenticatedHeaders,
        createZodValidator("param", GroupUserParamSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string; userId: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            await removeGroupMember(params.id, params.userId, actorId, em);
            lmsGroupEventsTotal.inc({ action: "member_removed" });
            return c.body(null, 204);
        }
    );

    router.get(
        "/:id/bans",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("query", PaginationQuerySchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const actorRole: UserSystemRole | undefined = c.get("userRole");
            const params: { id: string } = c.req.valid("param");
            const query: PaginationQuery = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<GroupBanRecord> = await listGroupBans(
                params.id,
                actorId,
                actorRole,
                query,
                em
            );
            return c.json(result, 200);
        }
    );

    router.post(
        "/:id/bans",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", BanMemberSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: BanMemberDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: GroupBanRecord = await banGroupUser(params.id, actorId, payload, em);
            lmsGroupEventsTotal.inc({ action: "member_banned" });
            return c.json(result, 201);
        }
    );

    router.delete(
        "/:id/bans/:userId",
        requireAuthenticatedHeaders,
        createZodValidator("param", GroupUserParamSchema),
        async (c): Promise<Response> => {
            const actorId: string = getAuthenticatedUserId(c);
            const params: { id: string; userId: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            await unbanGroupUser(params.id, params.userId, actorId, em);
            lmsGroupEventsTotal.inc({ action: "member_unbanned" });
            return c.body(null, 204);
        }
    );

    return router;
}
