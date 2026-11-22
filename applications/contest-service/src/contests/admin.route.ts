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
    deleteContestByAdmin,
    getContestForAdmin,
    listContestsForAdmin,
    updateContestStatusByAdmin
} from "./contest.admin";
import {
    AdminDeleteSchema,
    AdminStatusSchema,
    IdParamSchema,
    ListContestsQuerySchema
} from "./schemas/contest.schema";

function getAdminUserId(c: Context<AppEnv>): string {
    const adminUserId = c.get("userId");
    if (!adminUserId) {
        throw AppError.unauthorized("UNAUTHORIZED", "Authenticated user ID is missing.");
    }
    return adminUserId;
}

export function createAdminRoute(): Hono<AppEnv> {
    const router = new Hono<AppEnv>();

    router.use("*", requireAuthenticatedHeaders);
    router.use("*", requireAdminRole);

    router.get(
        "/",
        createZodValidator("query", ListContestsQuerySchema),
        async (c): Promise<Response> => {
            const query = c.req.valid("query");
            const em = c.get("em");
            const result = await listContestsForAdmin(query, em);
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id",
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const params = c.req.valid("param");
            const em = c.get("em");
            const result = await getContestForAdmin(params.id, em);
            return c.json(result, 200);
        }
    );

    router.patch(
        "/:id/status",
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", AdminStatusSchema),
        async (c): Promise<Response> => {
            const adminUserId = getAdminUserId(c);
            const params = c.req.valid("param");
            const payload = c.req.valid("json");
            const em = c.get("em");
            const result = await updateContestStatusByAdmin(params.id, adminUserId, payload, em);
            return c.json(result, 200);
        }
    );

    router.delete(
        "/:id",
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const adminUserId = getAdminUserId(c);
            const params = c.req.valid("param");
            const payload = await parseOptionalJsonBody(c, AdminDeleteSchema);
            const em = c.get("em");
            await deleteContestByAdmin(params.id, adminUserId, payload.reason, em);
            return c.body(null, 204);
        }
    );

    return router;
}
