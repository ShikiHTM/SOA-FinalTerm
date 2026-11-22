import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono, type Context } from "hono";
import { AppError } from "../shared/errors";
import {
    createZodValidator,
    parseOptionalJsonBody,
    requireAdminRole,
    requireAuthenticatedHeaders
} from "../shared/middleware";
import type { AppEnv } from "../shared/types";
import {
    deleteGroupByAdmin,
    getGroupForAdmin,
    listGroupsForAdmin,
    updateGroupStatusByAdmin,
    type AdminGroupRecord,
    type PaginatedAdminGroups
} from "./group.admin";
import {
    AdminDeleteGroupSchema,
    AdminListGroupsQuerySchema,
    AdminUpdateGroupStatusSchema,
    GroupIdParamSchema,
    type AdminDeleteGroupDto,
    type AdminListGroupsQueryDto,
    type AdminUpdateGroupStatusDto,
    type GroupIdParamDto
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
        createZodValidator("query", AdminListGroupsQuerySchema),
        async (c): Promise<Response> => {
            const query: AdminListGroupsQueryDto = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedAdminGroups = await listGroupsForAdmin(query, em);
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id",
        createZodValidator("param", GroupIdParamSchema),
        async (c): Promise<Response> => {
            const params: GroupIdParamDto = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: AdminGroupRecord = await getGroupForAdmin(params.id, em);
            return c.json(result, 200);
        }
    );

    router.patch(
        "/:id/status",
        createZodValidator("param", GroupIdParamSchema),
        createZodValidator("json", AdminUpdateGroupStatusSchema),
        async (c): Promise<Response> => {
            const adminUserId: string = getAdminUserId(c);
            const params: GroupIdParamDto = c.req.valid("param");
            const payload: AdminUpdateGroupStatusDto = c.req.valid("json");
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
        createZodValidator("param", GroupIdParamSchema),
        async (c): Promise<Response> => {
            const adminUserId: string = getAdminUserId(c);
            const params: GroupIdParamDto = c.req.valid("param");
            const payload: AdminDeleteGroupDto = await parseOptionalJsonBody(
                c,
                AdminDeleteGroupSchema
            );
            const em: EntityManager = c.get("em");
            await deleteGroupByAdmin(params.id, adminUserId, payload, em);
            return c.body(null, 204);
        }
    );

    return router;
}
