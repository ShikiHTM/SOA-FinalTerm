import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono, type Context } from "hono";
import { AppError } from "../shared/errors";
import {
    createZodValidator,
    requireAdminRole,
    requireAuthenticatedHeaders
} from "../shared/middleware";
import type { AppEnv, PaginatedResult, UserSystemRole } from "../shared/types";
import {
    IdParamSchema,
    ListUsersQuerySchema,
    UpdateUserRoleSchema,
    UpdateUserStatusSchema,
    type ListUsersQuery,
    type UpdateUserStatusDto
} from "./schemas/user.schema";
import {
    getUserForAdmin,
    listUsersForAdmin,
    updateUserRole,
    updateUserStatus,
    type AdminUserRecord
} from "./user.admin";

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
        createZodValidator("query", ListUsersQuerySchema),
        async (c): Promise<Response> => {
            const query: ListUsersQuery = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<AdminUserRecord> = await listUsersForAdmin(query, em);
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id",
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const user: AdminUserRecord = await getUserForAdmin(params.id, em);
            return c.json(user, 200);
        }
    );

    router.patch(
        "/:id/status",
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", UpdateUserStatusSchema),
        async (c): Promise<Response> => {
            const adminUserId: string = getAdminUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: UpdateUserStatusDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const user: AdminUserRecord = await updateUserStatus(params.id, adminUserId, payload, em);
            return c.json(user, 200);
        }
    );

    router.patch(
        "/:id/role",
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", UpdateUserRoleSchema),
        async (c): Promise<Response> => {
            const adminUserId: string = getAdminUserId(c);
            const params: { id: string } = c.req.valid("param");
            const payload: { system_role: UserSystemRole } = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const user: AdminUserRecord = await updateUserRole(
                params.id,
                adminUserId,
                payload.system_role,
                em
            );
            return c.json(user, 200);
        }
    );

    return router;
}
