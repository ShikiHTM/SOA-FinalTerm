import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono, type Context } from "hono";
import { AppError } from "../shared/errors";
import {
    createZodValidator,
    parseOptionalJsonBody,
    requireAdminRole,
    requireAuthenticatedHeaders
} from "../shared/middleware";
import type { AppEnv, PaginatedResult } from "../shared/types";
import {
    deleteGroupByAdmin,
    getGroupForAdmin,
    listGroupsForAdmin,
    updateGroupStatusByAdmin,
    type AdminGroupRecord
} from "./group.admin";
import {
    AdminDeleteSchema,
    AdminStatusSchema,
    IdParamSchema,
    ListGroupsQuerySchema,
    type AdminStatusDto,
    type ListGroupsQuery
} from "./schemas/group.schema";

function getAdminUserId(c: Context<AppEnv>): string {
    const adminUserId: string | undefined = c.get("userId");
    if (!adminUserId) {
        throw AppError.unauthorized("UNAUTHORIZED", "Authenticated user ID is missing.");
    }
    return adminUserId;
}

export function createAdminRoute(): Hono<AppEnv> {
    const router: Hono<AppEnv> = new Hono<AppEnv>();

    router.use("*", requireAuthenticatedHeaders);
    router.use("*", requireAdminRole);

    router.get(
        "/",
        createZodValidator("query", ListGroupsQuerySchema),
        async (c): Promise<Response> => {
            const query: ListGroupsQuery = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<AdminGroupRecord> = await listGroupsForAdmin(query, em);
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id",
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: AdminGroupRecord = await getGroupForAdmin(params.id, em);
            return c.json(result, 200);
        }
    );

    router.patch(
        "/:id/status",
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", AdminStatusSchema),
        async (c): Promise<Response> => {
            const adminUserId: string = getAdminUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: AdminStatusDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: AdminGroupRecord = await updateGroupStatusByAdmin(
                params.id,
                adminUserId,
                payload,
                em
            );
            return c.json(result, 200);
        }
    );

    router.delete(
        "/:id",
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const adminUserId: string = getAdminUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: { reason?: string } = await parseOptionalJsonBody(c, AdminDeleteSchema);
            const em: EntityManager = c.get("em");
            await deleteGroupByAdmin(params.id, adminUserId, payload.reason, em);
            return c.body(null, 204);
        }
    );

    return router;
}
