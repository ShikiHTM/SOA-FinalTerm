import { Hono, type Context } from "hono";
import type { ServiceClients } from "../shared/clients";
import { AppError } from "../shared/errors";
import {
    createZodValidator,
    optionalAuthenticatedHeaders,
    requireAuthenticatedHeaders
} from "../shared/middleware";
import type { AppEnv, UserSystemRole } from "../shared/types";
import {
    cancelContest,
    createContest,
    deleteContest,
    getContestById,
    getContestParticipation,
    getInternalSubmissionContext,
    listContests,
    updateContest
} from "./contest.core";
import {
    CreateContestSchema,
    IdParamSchema,
    ListContestsQuerySchema,
    SubmissionContextQuerySchema,
    UpdateContestSchema
} from "./schemas/contest.schema";

function getActorIdentity(c: Context<AppEnv>): { userId: string; userRole: UserSystemRole } {
    const userId = c.get("userId");
    const userRole = c.get("userRole");
    if (!userId || !userRole) {
        throw AppError.unauthorized(
            "UNAUTHORIZED",
            "Authenticated user identity headers are required."
        );
    }
    return { userId, userRole };
}

export function createContestRoute(clients: ServiceClients): Hono<AppEnv> {
    const router = new Hono<AppEnv>();

    router.get(
        "/",
        optionalAuthenticatedHeaders,
        createZodValidator("query", ListContestsQuerySchema),
        async (c): Promise<Response> => {
            const query = c.req.valid("query");
            const viewerId = c.get("userId");
            const viewerRole = c.get("userRole");
            const em = c.get("em");
            const result = await listContests(query, viewerId, viewerRole, clients, em);
            return c.json(result, 200);
        }
    );

    router.post(
        "/",
        requireAuthenticatedHeaders,
        createZodValidator("json", CreateContestSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const payload = c.req.valid("json");
            const em = c.get("em");
            const created = await createContest(
                actor.userId,
                actor.userRole,
                payload,
                clients,
                em
            );
            return c.json(created, 201);
        }
    );

    router.get(
        "/:id/submission-context",
        createZodValidator("param", IdParamSchema),
        createZodValidator("query", SubmissionContextQuerySchema),
        async (c): Promise<Response> => {
            const params = c.req.valid("param");
            const query = c.req.valid("query");
            const em = c.get("em");
            const context = await getInternalSubmissionContext(
                params.id,
                query.user_id,
                clients,
                em
            );
            return c.json(context, 200);
        }
    );

    router.get(
        "/:id/participation",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params = c.req.valid("param");
            const em = c.get("em");
            const participation = await getContestParticipation(
                params.id,
                actor.userId,
                actor.userRole,
                clients,
                em
            );
            return c.json(participation, 200);
        }
    );

    router.post(
        "/:id/cancel",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params = c.req.valid("param");
            const em = c.get("em");
            const cancelled = await cancelContest(
                params.id,
                actor.userId,
                actor.userRole,
                clients,
                em
            );
            return c.json(cancelled, 200);
        }
    );

    router.get(
        "/:id",
        optionalAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const params = c.req.valid("param");
            const viewerId = c.get("userId");
            const viewerRole = c.get("userRole");
            const em = c.get("em");
            const contest = await getContestById(params.id, viewerId, viewerRole, clients, em);
            return c.json(contest, 200);
        }
    );

    router.patch(
        "/:id",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", UpdateContestSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params = c.req.valid("param");
            const payload = c.req.valid("json");
            const em = c.get("em");
            const updated = await updateContest(
                params.id,
                actor.userId,
                actor.userRole,
                payload,
                clients,
                em
            );
            return c.json(updated, 200);
        }
    );

    router.delete(
        "/:id",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params = c.req.valid("param");
            const em = c.get("em");
            await deleteContest(params.id, actor.userId, actor.userRole, clients, em);
            return c.body(null, 204);
        }
    );

    return router;
}
