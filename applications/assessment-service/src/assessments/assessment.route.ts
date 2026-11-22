import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono, type Context } from "hono";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import type { GroupAccessClient } from "../shared/group-access";
import {
    createZodValidator,
    formatZodIssues,
    parseOptionalJsonBody,
    requireAuthenticatedHeaders
} from "../shared/middleware";
import type { AppEnv, PaginatedResult, UserSystemRole } from "../shared/types";
import type { AssessmentStorage } from "../storage/s3.storage";
import {
    createDigitalAssessment,
    createPdfAssessment,
    deleteAssessment,
    getAssessmentAnswerKey,
    getAssessmentById,
    getInternalAssessmentSummary,
    getInternalGradingData,
    getPublicAssessmentContent,
    listGroupAssessments,
    updateAssessment,
    upsertAssessmentAnswerKey,
    type AnswerKeyDocument,
    type AssessmentContentResponse,
    type AssessmentMetadata,
    type InternalAssessmentSummary,
    type InternalGradingDataResponse
} from "./assessment.core";
import {
    listFavoriteAssessments,
    markFavoriteAssessment,
    unmarkFavoriteAssessment,
    type FavoriteActionResponse,
    type FavoriteAssessmentItem
} from "./assessment.favorite";
import {
    CreateDigitalAssessmentSchema,
    CreatePdfAssessmentSchema,
    GradingDataQuerySchema,
    GroupAssessmentsQuerySchema,
    IdParamSchema,
    PaginationQuerySchema,
    UpdateAssessmentSchema,
    UpsertAnswerKeySchema,
    type CreateDigitalAssessmentDto,
    type GroupAssessmentsQuery,
    type PaginationQuery,
    type UpdateAssessmentDto,
    type UpsertAnswerKeyDto
} from "./schemas/assessment.schema";

function getActorIdentity(c: Context<AppEnv>): { userId: string; userRole: UserSystemRole } {
    const userId: string | undefined = c.get("userId");
    const userRole: UserSystemRole | undefined = c.get("userRole");
    if (!userId || !userRole) {
        throw AppError.unauthorized(
            "UNAUTHORIZED",
            "Authenticated user identity headers are required."
        );
    }
    return { userId, userRole };
}

function isBinaryFileLike(value: unknown): value is { arrayBuffer(): Promise<ArrayBuffer> } {
    return (
        typeof value === "object" &&
        value !== null &&
        "arrayBuffer" in value &&
        typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
    );
}

async function parseMultipartFieldsAndFile(
    c: Context<AppEnv>
): Promise<{ fields: Record<string, string>; fileBuffer: Buffer | null }> {
    let parsedBody: Record<string, unknown>;
    try {
        parsedBody = (await c.req.parseBody()) as Record<string, unknown>;
    } catch {
        throw AppError.badRequest("VALIDATION_ERROR", "Malformed multipart/form-data payload.");
    }
    const fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    for (const [key, value] of Object.entries(parsedBody)) {
        if (typeof value === "string") {
            fields[key] = value;
        } else if (key === "file" && isBinaryFileLike(value)) {
            const arrayBuffer: ArrayBuffer = await value.arrayBuffer();
            fileBuffer = Buffer.from(arrayBuffer);
        }
    }
    return { fields, fileBuffer };
}

export function createAssessmentRoute(
    env: EnvConfig,
    groupAccess: GroupAccessClient,
    storage: AssessmentStorage
): Hono<AppEnv> {
    const router: Hono<AppEnv> = new Hono<AppEnv>();

    router.get(
        "/favorites",
        requireAuthenticatedHeaders,
        createZodValidator("query", PaginationQuerySchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const query: PaginationQuery = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<FavoriteAssessmentItem> = await listFavoriteAssessments(
                actor.userId,
                query,
                em
            );
            return c.json(result, 200);
        }
    );

    router.get(
        "/",
        requireAuthenticatedHeaders,
        createZodValidator("query", GroupAssessmentsQuerySchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const query: GroupAssessmentsQuery = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const result: PaginatedResult<AssessmentMetadata> = await listGroupAssessments(
                query,
                actor.userId,
                actor.userRole,
                groupAccess,
                em
            );
            return c.json(result, 200);
        }
    );

    router.post(
        "/",
        requireAuthenticatedHeaders,
        createZodValidator("json", CreateDigitalAssessmentSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const payload: CreateDigitalAssessmentDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const created: AssessmentMetadata = await createDigitalAssessment(
                actor.userId,
                actor.userRole,
                payload,
                groupAccess,
                storage,
                em
            );
            return c.json(created, 201);
        }
    );

    router.post("/pdf", requireAuthenticatedHeaders, async (c): Promise<Response> => {
        const actor = getActorIdentity(c);
        const { fields, fileBuffer } = await parseMultipartFieldsAndFile(c);
        if (fileBuffer === null) {
            throw AppError.badRequest("MISSING_FILE", "PDF file is required.");
        }
        const parsedForm = CreatePdfAssessmentSchema.safeParse(fields);
        if (!parsedForm.success) {
            throw AppError.badRequest(
                "VALIDATION_ERROR",
                "Request validation failed.",
                formatZodIssues(parsedForm.error.issues)
            );
        }
        const em: EntityManager = c.get("em");
        const created: AssessmentMetadata = await createPdfAssessment(
            actor.userId,
            actor.userRole,
            parsedForm.data,
            fileBuffer,
            env,
            groupAccess,
            storage,
            em
        );
        return c.json(created, 201);
    });

    router.get(
        "/:id/summary",
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const summary: InternalAssessmentSummary = await getInternalAssessmentSummary(
                params.id,
                em
            );
            return c.json(summary, 200);
        }
    );

    router.get(
        "/:id/grading-data",
        createZodValidator("param", IdParamSchema),
        createZodValidator("query", GradingDataQuerySchema),
        async (c): Promise<Response> => {
            const params: { id: string } = c.req.valid("param");
            const query: { version?: number } = c.req.valid("query");
            const em: EntityManager = c.get("em");
            const data: InternalGradingDataResponse = await getInternalGradingData(
                params.id,
                query.version,
                storage,
                em
            );
            return c.json(data, 200);
        }
    );

    router.get(
        "/:id/content",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const content: AssessmentContentResponse = await getPublicAssessmentContent(
                params.id,
                actor.userId,
                actor.userRole,
                groupAccess,
                storage,
                em
            );
            return c.json(content, 200);
        }
    );

    router.get(
        "/:id/answer-key",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const answerKey: AnswerKeyDocument = await getAssessmentAnswerKey(
                params.id,
                actor.userId,
                actor.userRole,
                groupAccess,
                storage,
                em
            );
            return c.json(answerKey, 200);
        }
    );

    router.put(
        "/:id/answer-key",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        createZodValidator("json", UpsertAnswerKeySchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params: { id: string } = c.req.valid("param");
            const payload: UpsertAnswerKeyDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const updated: AnswerKeyDocument = await upsertAssessmentAnswerKey(
                params.id,
                actor.userId,
                actor.userRole,
                payload,
                groupAccess,
                storage,
                em
            );
            return c.json(updated, 200);
        }
    );

    router.post(
        "/:id/favorite",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: FavoriteActionResponse = await markFavoriteAssessment(
                params.id,
                actor.userId,
                actor.userRole,
                groupAccess,
                em
            );
            return c.json(result, 200);
        }
    );

    router.delete(
        "/:id/favorite",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const result: FavoriteActionResponse = await unmarkFavoriteAssessment(
                params.id,
                actor.userId,
                em
            );
            return c.json(result, 200);
        }
    );

    router.get(
        "/:id",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const assessment: AssessmentMetadata = await getAssessmentById(
                params.id,
                actor.userId,
                actor.userRole,
                groupAccess,
                em
            );
            return c.json(assessment, 200);
        }
    );

    router.put(
        "/:id",
        requireAuthenticatedHeaders,
        createZodValidator("param", IdParamSchema),
        async (c): Promise<Response> => {
            const actor = getActorIdentity(c);
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            const contentType: string = (c.req.header("Content-Type") ?? "").toLowerCase();

            let payload: UpdateAssessmentDto;
            let fileBuffer: Buffer | null = null;
            if (contentType.includes("multipart/form-data")) {
                const parsedMultipart = await parseMultipartFieldsAndFile(c);
                const parsedForm = UpdateAssessmentSchema.safeParse(parsedMultipart.fields);
                if (!parsedForm.success) {
                    throw AppError.badRequest(
                        "VALIDATION_ERROR",
                        "Request validation failed.",
                        formatZodIssues(parsedForm.error.issues)
                    );
                }
                payload = parsedForm.data;
                fileBuffer = parsedMultipart.fileBuffer;
            } else {
                payload = await parseOptionalJsonBody(c, UpdateAssessmentSchema);
            }

            const updated: AssessmentMetadata = await updateAssessment(
                params.id,
                actor.userId,
                actor.userRole,
                payload,
                fileBuffer,
                env,
                groupAccess,
                storage,
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
            const params: { id: string } = c.req.valid("param");
            const em: EntityManager = c.get("em");
            await deleteAssessment(params.id, actor.userId, actor.userRole, groupAccess, em);
            return c.body(null, 204);
        }
    );

    return router;
}
