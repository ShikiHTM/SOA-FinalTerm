import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { createApp } from "../src/app";
import type { AdminAssessmentRecord } from "../src/assessments/assessment.admin";
import type {
    AnswerKeyDocument,
    AssessmentContentResponse,
    AssessmentMetadata,
    InternalAssessmentSummary,
    InternalGradingDataResponse
} from "../src/assessments/assessment.core";
import type { FavoriteAssessmentItem, FavoriteActionResponse } from "../src/assessments/assessment.favorite";
import {
    AssessmentFavoriteSchema,
    type AssessmentFavoriteEntity
} from "../src/db/entities/assessment-favorite.entity";
import { AssessmentSchema, type AssessmentEntity } from "../src/db/entities/assessment.entity";
import { closeDB, createMikroOrmConfig, forkEm, getORM } from "../src/db/orm";
import type { EnvConfig } from "../src/shared/env";
import { AppError } from "../src/shared/errors";
import type { GroupAccessClient, GroupMembershipInfo } from "../src/shared/group-access";
import {
    AssessmentContentFormat,
    AssessmentCreationMode,
    AssessmentStatus,
    AssessmentType,
    AssessmentVisibility,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility,
    QuestionType,
    UserSystemRole,
    type PaginatedResult
} from "../src/shared/types";
import {
    createS3AssessmentStorage,
    validatePdfBuffer,
    type AssessmentStorage,
    type PresignedUrlResult
} from "../src/storage/s3.storage";

interface MockDatabaseState {
    assessments: AssessmentEntity[];
    favorites: AssessmentFavoriteEntity[];
    forkCount: number;
    shouldFailNextFlush: boolean;
}

interface StoredS3Object {
    contentType: string;
    body: Buffer | unknown;
    metadata: Record<string, string>;
}

class InMemoryAssessmentEntityManager {
    private readonly state: MockDatabaseState;
    private readonly pendingPersists: unknown[] = [];
    private readonly pendingRemovals: unknown[] = [];

    public constructor(state: MockDatabaseState) {
        this.state = state;
    }

    public create(schema: unknown, data: Record<string, unknown>): unknown {
        const now: Date = new Date();
        if (schema === AssessmentSchema) {
            const assessment: AssessmentEntity = {
                id: (data.id as string | undefined) ?? v4(),
                groupId: data.groupId as string,
                createdBy: data.createdBy as string,
                title: data.title as string,
                description: (data.description as string | undefined) ?? "",
                assessmentType: data.assessmentType as AssessmentType,
                creationMode: data.creationMode as AssessmentCreationMode,
                contentFormat: data.contentFormat as AssessmentContentFormat,
                contentS3Key: data.contentS3Key as string,
                answerKeyS3Key: (data.answerKeyS3Key as string | null | undefined) ?? null,
                version: (data.version as number | undefined) ?? 1,
                questionCount: (data.questionCount as number | undefined) ?? 0,
                totalPoints: (data.totalPoints as number | undefined) ?? 0,
                hasEssayItems: (data.hasEssayItems as boolean | undefined) ?? false,
                isPracticeEnabled: (data.isPracticeEnabled as boolean | undefined) ?? false,
                visibility:
                    (data.visibility as AssessmentVisibility | undefined) ??
                    AssessmentVisibility.DRAFT,
                status: (data.status as AssessmentStatus | undefined) ?? AssessmentStatus.ACTIVE,
                moderationReason: (data.moderationReason as string | null | undefined) ?? null,
                moderatedBy: (data.moderatedBy as string | null | undefined) ?? null,
                moderatedAt: (data.moderatedAt as Date | null | undefined) ?? null,
                deletedAt: (data.deletedAt as Date | null | undefined) ?? null,
                deletedBy: (data.deletedBy as string | null | undefined) ?? null,
                createdAt: (data.createdAt as Date | undefined) ?? now,
                updatedAt: (data.updatedAt as Date | undefined) ?? now
            };
            return assessment;
        }
        if (schema === AssessmentFavoriteSchema) {
            const favorite: AssessmentFavoriteEntity = {
                userId: data.userId as string,
                assessment: data.assessment as AssessmentEntity,
                createdAt: (data.createdAt as Date | undefined) ?? now
            };
            return favorite;
        }
        throw new Error("Unsupported schema in test mock.");
    }

    public persist(entity: unknown): this {
        this.pendingPersists.push(entity);
        return this;
    }

    public remove(entity: unknown): this {
        this.pendingRemovals.push(entity);
        return this;
    }

    public async flush(): Promise<void> {
        if (this.state.shouldFailNextFlush) {
            this.state.shouldFailNextFlush = false;
            this.pendingPersists.length = 0;
            this.pendingRemovals.length = 0;
            throw new Error("Simulated PostgreSQL flush failure.");
        }
        for (const entity of this.pendingPersists) {
            if (this.isAssessmentEntity(entity) && !this.state.assessments.includes(entity)) {
                this.state.assessments.push(entity);
            } else if (this.isFavoriteEntity(entity) && !this.state.favorites.includes(entity)) {
                this.state.favorites.push(entity);
            }
        }
        for (const entity of this.pendingRemovals) {
            this.state.assessments = this.state.assessments.filter(
                (item: AssessmentEntity): boolean => item !== entity
            );
            this.state.favorites = this.state.favorites.filter(
                (item: AssessmentFavoriteEntity): boolean => item !== entity
            );
        }
        this.pendingPersists.length = 0;
        this.pendingRemovals.length = 0;
    }

    public async findOne(schema: unknown, where: Record<string, unknown>): Promise<unknown> {
        const matches: unknown[] = await this.find(schema, where);
        return matches[0] ?? null;
    }

    public async findAndCount(
        schema: unknown,
        where: Record<string, unknown>,
        options: {
            orderBy?: Record<string, string>;
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<[unknown[], number]> {
        const matches: unknown[] = await this.find(schema, where, options);
        const offset: number = options.offset ?? 0;
        const paged: unknown[] =
            options.limit !== undefined
                ? matches.slice(offset, offset + options.limit)
                : matches.slice(offset);
        return [paged, matches.length];
    }

    public async find(
        schema: unknown,
        where: Record<string, unknown>,
        options: { orderBy?: Record<string, string> } = {}
    ): Promise<unknown[]> {
        let results: unknown[] = [];
        if (schema === AssessmentSchema) {
            results = this.state.assessments.filter((assessment: AssessmentEntity): boolean =>
                this.matchesAssessmentWhere(assessment, where)
            );
        } else if (schema === AssessmentFavoriteSchema) {
            results = this.state.favorites.filter((favorite: AssessmentFavoriteEntity): boolean => {
                if (typeof where.userId === "string" && favorite.userId !== where.userId) {
                    return false;
                }
                if (
                    typeof where.assessment === "string" &&
                    favorite.assessment.id !== where.assessment
                ) {
                    return false;
                }
                return true;
            });
        }

        if (options.orderBy) {
            const ordered: unknown[] = [...results];
            const [sortKey, sortDir]: [string, string] = Object.entries(options.orderBy)[0];
            ordered.sort((left: unknown, right: unknown): number => {
                const leftDate: Date = (left as Record<string, Date>)[sortKey];
                const rightDate: Date = (right as Record<string, Date>)[sortKey];
                const diff: number = leftDate.getTime() - rightDate.getTime();
                return sortDir.toUpperCase() === "DESC" ? -diff : diff;
            });
            return ordered;
        }
        return results;
    }

    private matchesStringCondition(value: string, condition: unknown): boolean {
        if (typeof condition === "string") {
            return value === condition;
        }
        if (typeof condition === "object" && condition !== null) {
            if ("$in" in condition && Array.isArray(condition.$in)) {
                return condition.$in.includes(value);
            }
            if ("$ilike" in condition && typeof condition.$ilike === "string") {
                const rawPattern: string = condition.$ilike.replace(/^%|%$/g, "").toLowerCase();
                return value.toLowerCase().includes(rawPattern);
            }
        }
        return true;
    }

    private matchesAssessmentWhere(
        assessment: AssessmentEntity,
        where: Record<string, unknown>
    ): boolean {
        if (where.deletedAt === null && assessment.deletedAt !== null) {
            return false;
        }
        if (where.id !== undefined && assessment.id !== where.id) {
            return false;
        }
        if (where.groupId !== undefined && assessment.groupId !== where.groupId) {
            return false;
        }
        if (
            where.visibility !== undefined &&
            !this.matchesStringCondition(assessment.visibility, where.visibility)
        ) {
            return false;
        }
        if (where.status !== undefined && assessment.status !== where.status) {
            return false;
        }
        if (
            where.isPracticeEnabled !== undefined &&
            assessment.isPracticeEnabled !== where.isPracticeEnabled
        ) {
            return false;
        }
        if (where.title !== undefined && !this.matchesStringCondition(assessment.title, where.title)) {
            return false;
        }
        if (
            where.description !== undefined &&
            !this.matchesStringCondition(assessment.description, where.description)
        ) {
            return false;
        }
        if (Array.isArray(where.$or)) {
            const orList: Record<string, unknown>[] = where.$or as Record<string, unknown>[];
            const anyMatch: boolean = orList.some((clause: Record<string, unknown>): boolean =>
                this.matchesAssessmentWhere(assessment, clause)
            );
            if (!anyMatch) {
                return false;
            }
        }
        return true;
    }

    private isAssessmentEntity(entity: unknown): entity is AssessmentEntity {
        return typeof entity === "object" && entity !== null && "contentS3Key" in entity;
    }

    private isFavoriteEntity(entity: unknown): entity is AssessmentFavoriteEntity {
        return (
            typeof entity === "object" &&
            entity !== null &&
            "userId" in entity &&
            "assessment" in entity
        );
    }
}

interface MockS3Storage extends AssessmentStorage {
    objects: Map<string, StoredS3Object>;
    deletedKeysHistory: string[];
}

function createInMemoryS3Storage(): MockS3Storage {
    const objects: Map<string, StoredS3Object> = new Map<string, StoredS3Object>();
    const deletedKeysHistory: string[] = [];

    return {
        objects,
        deletedKeysHistory,
        async ensureBucket(): Promise<void> {
            return Promise.resolve();
        },
        async putJson(
            key: string,
            payload: unknown,
            metadata: Record<string, string> = {}
        ): Promise<void> {
            objects.set(key, {
                contentType: "application/json; charset=utf-8",
                body: JSON.parse(JSON.stringify(payload)),
                metadata
            });
        },
        async putPdf(
            key: string,
            buffer: Buffer,
            metadata: Record<string, string> = {}
        ): Promise<void> {
            objects.set(key, {
                contentType: "application/pdf",
                body: Buffer.from(buffer),
                metadata
            });
        },
        async getJson<T>(key: string): Promise<T> {
            const entry: StoredS3Object | undefined = objects.get(key);
            if (!entry) {
                throw AppError.notFound(
                    "STORAGE_OBJECT_NOT_FOUND",
                    "Assessment storage object was not found."
                );
            }
            return entry.body as T;
        },
        async getPresignedPdfUrl(
            key: string,
            expiresInSeconds: number = 900
        ): Promise<PresignedUrlResult> {
            if (!key.startsWith("assessments/") || !key.endsWith(".pdf")) {
                throw AppError.badRequest(
                    "INVALID_STORAGE_KEY",
                    "Presigned URL generation is only allowed for PDF content objects."
                );
            }
            if (!objects.has(key)) {
                throw AppError.notFound("STORAGE_OBJECT_NOT_FOUND", "PDF object not found.");
            }
            return {
                url: `https://minio.local/lms-assessments/${key}?X-Amz-Expires=${expiresInSeconds}&X-Amz-Signature=mock`,
                expiresInSeconds
            };
        },
        async deleteObjects(keys: string[]): Promise<void> {
            for (const key of keys) {
                deletedKeysHistory.push(key);
                objects.delete(key);
            }
        }
    };
}

function createMockGroupAccess(
    memberships: Map<string, GroupMembershipInfo>
): GroupAccessClient {
    return {
        async getMembership(groupId: string, userId: string): Promise<GroupMembershipInfo> {
            const found: GroupMembershipInfo | undefined = memberships.get(`${groupId}:${userId}`);
            if (found) {
                return found;
            }
            return {
                group_id: groupId,
                user_id: userId,
                group_status: GroupStatus.ACTIVE,
                visibility: GroupVisibility.PUBLIC,
                is_member: false,
                is_banned: false,
                role: null,
                can_manage: false,
                is_owner: false
            };
        }
    };
}

function createTestEnv(): EnvConfig {
    return {
        port: 8003,
        dbHost: "localhost",
        dbPort: 5003,
        dbUser: "assessment_service",
        dbPassword: "assessment_service_dev",
        dbName: "assessment_db",
        dbSyncSchema: false,
        internalServiceSecret: "test-internal-secret",
        groupServiceUrl: "http://localhost:8002",
        s3Region: "ap-southeast-1",
        s3Bucket: "lms-assessments",
        s3Endpoint: "http://localhost:9000",
        s3PublicEndpoint: "http://localhost:9000",
        s3ForcePathStyle: true,
        s3AccessKeyId: "minioadmin",
        s3SecretAccessKey: "minioadmin",
        s3PresignExpiresInSeconds: 900,
        s3MaxPdfBytes: 1024,
        s3AutoCreateBucket: true,
        corsAllowedOrigins: ["http://localhost:8080", "http://127.0.0.1:8080"]
    };
}

function createTestHarness(): {
    app: ReturnType<typeof createApp>;
    state: MockDatabaseState;
    storage: MockS3Storage;
    memberships: Map<string, GroupMembershipInfo>;
    env: EnvConfig;
} {
    const env: EnvConfig = createTestEnv();
    const state: MockDatabaseState = {
        assessments: [],
        favorites: [],
        forkCount: 0,
        shouldFailNextFlush: false
    };
    const storage: MockS3Storage = createInMemoryS3Storage();
    const memberships: Map<string, GroupMembershipInfo> = new Map<string, GroupMembershipInfo>();
    const groupAccess: GroupAccessClient = createMockGroupAccess(memberships);
    const app: ReturnType<typeof createApp> = createApp({
        env,
        forkEntityManager: (): EntityManager => {
            state.forkCount += 1;
            return new InMemoryAssessmentEntityManager(state) as unknown as EntityManager;
        },
        groupAccess,
        storage
    });
    return { app, state, storage, memberships, env };
}

function setMembership(
    memberships: Map<string, GroupMembershipInfo>,
    groupId: string,
    userId: string,
    role: GroupMemberRole,
    visibility: GroupVisibility = GroupVisibility.PUBLIC
): void {
    memberships.set(`${groupId}:${userId}`, {
        group_id: groupId,
        user_id: userId,
        group_status: GroupStatus.ACTIVE,
        visibility,
        is_member: true,
        is_banned: false,
        role,
        can_manage: role === GroupMemberRole.MODERATOR || role === GroupMemberRole.OWNER,
        is_owner: role === GroupMemberRole.OWNER
    });
}

describe("assessment-service ORM, hardened S3 storage, CRUD, favorites, internal, and admin routes", (): void => {
    it("enforces module-level MikroORM singleton guard and fork helper", async (): Promise<void> => {
        await closeDB();
        assert.throws((): void => {
            getORM();
        }, /has not been initialized/);
        assert.throws((): void => {
            forkEm();
        }, /has not been initialized/);
    });

    it("generates complete PostgreSQL DDL directly from MikroORM entities", async (): Promise<void> => {
        const env: EnvConfig = createTestEnv();
        const orm: MikroORM = await MikroORM.init({
            ...createMikroOrmConfig(env),
            connect: false
        });
        try {
            const ddl: string = await orm.schema.getCreateSchemaSQL();
            assert.match(
                ddl,
                /create type "assessment_type" as enum \('MULTI_CHOICE', 'ESSAY', 'HYBRID'\)/i
            );
            assert.match(
                ddl,
                /create type "assessment_creation_mode" as enum \('DIRECT', 'PDF_IMPORT'\)/i
            );
            assert.match(
                ddl,
                /create type "assessment_content_format" as enum \('JSON', 'PDF'\)/i
            );
            assert.match(
                ddl,
                /create type "assessment_visibility" as enum \('DRAFT', 'PRIVATE', 'PUBLIC'\)/i
            );
            assert.match(
                ddl,
                /create type "assessment_status" as enum \('ACTIVE', 'HIDDEN'\)/i
            );
            assert.match(ddl, /create table "assessments"/i);
            assert.match(ddl, /create table "assessment_favorites"/i);
            assert.match(ddl, /"total_points" numeric\(10,2\)/i);
            assert.match(ddl, /on delete cascade/i);
        } finally {
            await orm.close(true);
        }
    });

    it("enforces X-Internal-Secret, CORS preflight, and EntityManager per-request forking", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();

        const preflightRes: Response = await app.request("/api/v1/internal/assessments/favorites", {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:8080",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-Internal-Secret, X-User-Id, X-User-Role"
            }
        });
        assert.equal(preflightRes.status, 204);
        assert.equal(
            preflightRes.headers.get("Access-Control-Allow-Origin"),
            "http://localhost:8080"
        );
        assert.equal(state.forkCount, 0);

        const missingSecretRes: Response = await app.request("/api/v1/internal/assessments/favorites");
        assert.equal(missingSecretRes.status, 401);
        assert.equal(state.forkCount, 0);

        const healthRes: Response = await app.request("/health");
        assert.equal(healthRes.status, 200);
        assert.deepEqual(await healthRes.json(), { status: "ok", service: "assessment-service" });
        assert.equal(state.forkCount, 0);

        const validRes: Response = await app.request("/api/v1/internal/assessments/favorites", {
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": v4(),
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(validRes.status, 200);
        assert.equal(state.forkCount, 1);
    });

    it("creates digital assessments on S3, strips answer keys from content, versions updates, and rolls back S3 on DB failure", async (): Promise<void> => {
        const { app, state, storage, memberships, env } = createTestHarness();
        const groupId: string = v4();
        const moderatorId: string = v4();
        const memberId: string = v4();

        setMembership(memberships, groupId, moderatorId, GroupMemberRole.MODERATOR);
        setMembership(memberships, groupId, memberId, GroupMemberRole.MEMBER);

        const memberForbiddenCreateRes: Response = await app.request(
            "/api/v1/internal/assessments",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    title: "Unauthorized Exam",
                    assessment_type: AssessmentType.MULTI_CHOICE,
                    group_id: groupId,
                    questions: [
                        {
                            id: "q1",
                            order: 1,
                            question_type: QuestionType.SINGLE_CHOICE,
                            prompt: "2 + 2 = ?",
                            points: 10,
                            options: [
                                { key: "A", text: "3" },
                                { key: "B", text: "4" }
                            ],
                            correct_answer: "B"
                        }
                    ]
                })
            }
        );
        assert.equal(memberForbiddenCreateRes.status, 403);
        assert.equal(storage.objects.size, 0);

        const createRes: Response = await app.request("/api/v1/internal/assessments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": moderatorId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                title: "Midterm Algorithms",
                description: "Graph & DP exam",
                assessment_type: AssessmentType.HYBRID,
                group_id: groupId,
                visibility: AssessmentVisibility.PRIVATE,
                is_practice_enabled: true,
                questions: [
                    {
                        id: "q1",
                        order: 1,
                        question_type: QuestionType.SINGLE_CHOICE,
                        prompt: "BFS complexity?",
                        points: 5,
                        options: [
                            { key: "A", text: "O(V + E)" },
                            { key: "B", text: "O(V^2 log V)" }
                        ],
                        correct_answer: "A"
                    },
                    {
                        id: "q2",
                        order: 2,
                        question_type: QuestionType.ESSAY,
                        prompt: "Explain Dijkstra correctness.",
                        points: 10,
                        grading_rubric: "Mention non-negative edge weights"
                    }
                ]
            })
        });
        assert.equal(createRes.status, 201);
        const created: AssessmentMetadata = (await createRes.json()) as AssessmentMetadata;
        assert.equal(created.version, 1);
        assert.equal(created.question_count, 2);
        assert.equal(created.total_points, 15);
        assert.equal(created.has_essay_items, true);
        assert.equal(created.has_answer_key, true);

        const v1ContentKey: string = `assessments/${groupId}/${created.id}/v1/content.json`;
        const v1AnswerKey: string = `assessments/${groupId}/${created.id}/v1/answers.json`;
        assert.equal(storage.objects.has(v1ContentKey), true);
        assert.equal(storage.objects.has(v1AnswerKey), true);

        const memberContentRes: Response = await app.request(
            `/api/v1/internal/assessments/${created.id}/content`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(memberContentRes.status, 200);
        const memberContent: AssessmentContentResponse =
            (await memberContentRes.json()) as AssessmentContentResponse;
        assert.equal(memberContent.questions?.length, 2);
        assert.equal("correct_answer" in (memberContent.questions?.[0] ?? {}), false);
        assert.equal("grading_rubric" in (memberContent.questions?.[1] ?? {}), false);

        const memberAnswerKeyForbiddenRes: Response = await app.request(
            `/api/v1/internal/assessments/${created.id}/answer-key`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(memberAnswerKeyForbiddenRes.status, 403);

        const managerAnswerKeyRes: Response = await app.request(
            `/api/v1/internal/assessments/${created.id}/answer-key`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": moderatorId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(managerAnswerKeyRes.status, 200);
        const answerKeyDoc: AnswerKeyDocument =
            (await managerAnswerKeyRes.json()) as AnswerKeyDocument;
        assert.equal(answerKeyDoc.answers[0].correct_answer, "A");

        const metadataOnlyUpdateRes: Response = await app.request(
            `/api/v1/internal/assessments/${created.id}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": moderatorId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ title: "Midterm Algorithms Renamed" })
            }
        );
        assert.equal(metadataOnlyUpdateRes.status, 200);
        assert.equal(((await metadataOnlyUpdateRes.json()) as AssessmentMetadata).version, 1);

        const updateQuestionsRes: Response = await app.request(
            `/api/v1/internal/assessments/${created.id}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": moderatorId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    questions: [
                        {
                            id: "q1",
                            order: 1,
                            question_type: QuestionType.FILL_IN_THE_BLANK,
                            prompt: "Shortest path algorithm for DAG?",
                            points: 20,
                            correct_answer: ["Topological Sort", "DAG Shortest Path"]
                        }
                    ]
                })
            }
        );
        assert.equal(updateQuestionsRes.status, 200);
        const updatedV2: AssessmentMetadata =
            (await updateQuestionsRes.json()) as AssessmentMetadata;
        assert.equal(updatedV2.version, 2);
        assert.equal(updatedV2.total_points, 20);
        assert.equal(updatedV2.has_essay_items, false);
        assert.equal(storage.objects.has(v1AnswerKey), true);
        assert.equal(
            storage.objects.has(`assessments/${groupId}/${created.id}/v2/answers.json`),
            true
        );

        state.shouldFailNextFlush = true;
        const failedCreateRes: Response = await app.request("/api/v1/internal/assessments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": moderatorId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                title: "Rollback Test Exam",
                assessment_type: AssessmentType.MULTI_CHOICE,
                group_id: groupId,
                questions: [
                    {
                        id: "q1",
                        order: 1,
                        question_type: QuestionType.SINGLE_CHOICE,
                        prompt: "1 + 1 = ?",
                        points: 10,
                        options: [
                            { key: "A", text: "2" },
                            { key: "B", text: "3" }
                        ],
                        correct_answer: "A"
                    }
                ]
            })
        });
        assert.equal(failedCreateRes.status, 500);
        assert.equal(storage.objects.size, 4);
        assert.equal(storage.deletedKeysHistory.length, 2);
    });

    it("validates PDF uploads (%PDF- magic bytes and max size), returns presigned URLs, and maps answer keys", async (): Promise<void> => {
        const { app, storage, memberships, env } = createTestHarness();
        const groupId: string = v4();
        const ownerId: string = v4();
        const memberId: string = v4();

        setMembership(memberships, groupId, ownerId, GroupMemberRole.OWNER);
        setMembership(memberships, groupId, memberId, GroupMemberRole.MEMBER);

        const realStorage: AssessmentStorage = createS3AssessmentStorage(env);
        await assert.rejects(
            realStorage.getPresignedPdfUrl(`assessments/${groupId}/${v4()}/v1/answers.json`),
            (error: unknown): boolean =>
                error instanceof AppError && error.errorCode === "INVALID_STORAGE_KEY"
        );
        assert.throws(
            (): void => {
                validatePdfBuffer(Buffer.alloc(0), env.s3MaxPdfBytes);
            },
            (error: unknown): boolean =>
                error instanceof AppError && error.errorCode === "EMPTY_FILE"
        );

        const fakePdfForm: FormData = new FormData();
        fakePdfForm.set("title", "Fake PDF Exam");
        fakePdfForm.set("assessment_type", AssessmentType.MULTI_CHOICE);
        fakePdfForm.set("group_id", groupId);
        fakePdfForm.set(
            "file",
            new Blob([Buffer.from("MZ-NOT-A-PDF", "utf8")], { type: "application/pdf" }),
            "exam.pdf"
        );
        const invalidPdfRes: Response = await app.request("/api/v1/internal/assessments/pdf", {
            method: "POST",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: fakePdfForm
        });
        assert.equal(invalidPdfRes.status, 400);
        assert.equal(
            ((await invalidPdfRes.json()) as { error_code: string }).error_code,
            "INVALID_PDF_FILE"
        );

        const oversizedForm: FormData = new FormData();
        oversizedForm.set("title", "Oversized PDF Exam");
        oversizedForm.set("assessment_type", AssessmentType.MULTI_CHOICE);
        oversizedForm.set("group_id", groupId);
        oversizedForm.set(
            "file",
            new Blob([Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1500, 65)])], {
                type: "application/pdf"
            }),
            "big.pdf"
        );
        const oversizedRes: Response = await app.request("/api/v1/internal/assessments/pdf", {
            method: "POST",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: oversizedForm
        });
        assert.equal(oversizedRes.status, 400);
        assert.equal(
            ((await oversizedRes.json()) as { error_code: string }).error_code,
            "FILE_TOO_LARGE"
        );

        const validPdfBytes: Buffer = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "utf8");
        const validPdfForm: FormData = new FormData();
        validPdfForm.set("title", "Calculus PDF Final");
        validPdfForm.set("assessment_type", AssessmentType.MULTI_CHOICE);
        validPdfForm.set("group_id", groupId);
        validPdfForm.set("visibility", AssessmentVisibility.PUBLIC);
        validPdfForm.set("is_practice_enabled", "true");
        validPdfForm.set(
            "file",
            new Blob([validPdfBytes], { type: "application/pdf" }),
            "calculus.pdf"
        );

        const createPdfRes: Response = await app.request("/api/v1/internal/assessments/pdf", {
            method: "POST",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: validPdfForm
        });
        assert.equal(createPdfRes.status, 201);
        const createdPdf: AssessmentMetadata = (await createPdfRes.json()) as AssessmentMetadata;
        assert.equal(createdPdf.content_format, AssessmentContentFormat.PDF);
        assert.equal(createdPdf.has_answer_key, false);

        const storedPdf = storage.objects.get(
            `assessments/${groupId}/${createdPdf.id}/v1/content.pdf`
        );
        assert.ok(storedPdf !== undefined && typeof storedPdf.metadata.content_sha256 === "string");

        const contentRes: Response = await app.request(
            `/api/v1/internal/assessments/${createdPdf.id}/content`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(contentRes.status, 200);
        const contentBody: AssessmentContentResponse =
            (await contentRes.json()) as AssessmentContentResponse;
        assert.equal(contentBody.content_format, AssessmentContentFormat.PDF);
        assert.ok(contentBody.pdf_url?.includes("/v1/content.pdf?X-Amz-Expires=900"));
        assert.equal(contentBody.questions, null);

        const mapAnswersRes: Response = await app.request(
            `/api/v1/internal/assessments/${createdPdf.id}/answer-key`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    answers: [
                        {
                            question_id: "1",
                            question_type: QuestionType.SINGLE_CHOICE,
                            points: 2.5,
                            correct_answer: "C"
                        },
                        {
                            question_id: "2",
                            question_type: QuestionType.MULTIPLE_CHOICE,
                            points: 7.5,
                            correct_answer: ["A", "D"]
                        }
                    ]
                })
            }
        );
        assert.equal(mapAnswersRes.status, 200);
        const mappedDoc: AnswerKeyDocument = (await mapAnswersRes.json()) as AnswerKeyDocument;
        assert.equal(mappedDoc.version, 2);
        assert.equal(mappedDoc.total_points, 10);

        const replacePdfForm: FormData = new FormData();
        replacePdfForm.set("title", "Calculus PDF Final v3");
        replacePdfForm.set(
            "file",
            new Blob([Buffer.from("%PDF-1.7\n%updated\n%%EOF", "utf8")], {
                type: "application/pdf"
            }),
            "calculus_v3.pdf"
        );
        const replacePdfRes: Response = await app.request(
            `/api/v1/internal/assessments/${createdPdf.id}`,
            {
                method: "PUT",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: replacePdfForm
            }
        );
        assert.equal(replacePdfRes.status, 200);
        const replacedMeta: AssessmentMetadata = (await replacePdfRes.json()) as AssessmentMetadata;
        assert.equal(replacedMeta.version, 3);
        assert.equal(replacedMeta.title, "Calculus PDF Final v3");
        assert.equal(
            storage.objects.has(`assessments/${groupId}/${createdPdf.id}/v3/content.pdf`),
            true
        );
    });

    it("supports favorites, group listing visibility, internal grading lookup, and admin moderation", async (): Promise<void> => {
        const { app, state, memberships, env } = createTestHarness();
        const groupId: string = v4();
        const moderatorId: string = v4();
        const memberId: string = v4();
        const outsiderId: string = v4();
        const adminId: string = v4();

        setMembership(memberships, groupId, moderatorId, GroupMemberRole.MODERATOR);
        setMembership(memberships, groupId, memberId, GroupMemberRole.MEMBER);

        const createPublicRes: Response = await app.request("/api/v1/internal/assessments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": moderatorId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                title: "Public Biology Practice",
                assessment_type: AssessmentType.MULTI_CHOICE,
                group_id: groupId,
                visibility: AssessmentVisibility.PUBLIC,
                is_practice_enabled: true,
                questions: [
                    {
                        id: "q1",
                        order: 1,
                        question_type: QuestionType.SINGLE_CHOICE,
                        prompt: "Cell powerhouse?",
                        points: 5,
                        options: [
                            { key: "A", text: "Mitochondria" },
                            { key: "B", text: "Nucleus" }
                        ],
                        correct_answer: "A"
                    }
                ]
            })
        });
        const publicExam: AssessmentMetadata =
            (await createPublicRes.json()) as AssessmentMetadata;

        const createDraftRes: Response = await app.request("/api/v1/internal/assessments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": moderatorId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                title: "Draft Final Exam",
                assessment_type: AssessmentType.ESSAY,
                group_id: groupId,
                visibility: AssessmentVisibility.DRAFT,
                questions: [
                    {
                        id: "q1",
                        order: 1,
                        question_type: QuestionType.ESSAY,
                        prompt: "Describe DNA replication.",
                        points: 10
                    }
                ]
            })
        });
        const draftExam: AssessmentMetadata = (await createDraftRes.json()) as AssessmentMetadata;

        const memberListRes: Response = await app.request(
            `/api/v1/internal/assessments?group_id=${groupId}&is_practice_enabled=true`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(memberListRes.status, 200);
        const memberList: PaginatedResult<AssessmentMetadata> =
            (await memberListRes.json()) as PaginatedResult<AssessmentMetadata>;
        assert.equal(memberList.items.length, 1);
        assert.equal(memberList.items[0].id, publicExam.id);

        const outsiderDraftFavRes: Response = await app.request(
            `/api/v1/internal/assessments/${draftExam.id}/favorite`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": outsiderId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(outsiderDraftFavRes.status, 403);

        const favRes: Response = await app.request(
            `/api/v1/internal/assessments/${publicExam.id}/favorite`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(favRes.status, 200);
        assert.deepEqual((await favRes.json()) as FavoriteActionResponse, {
            assessment_id: publicExam.id,
            favorited: true
        });

        const listFavsRes: Response = await app.request(
            "/api/v1/internal/assessments/favorites",
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(listFavsRes.status, 200);
        const favsList: PaginatedResult<FavoriteAssessmentItem> =
            (await listFavsRes.json()) as PaginatedResult<FavoriteAssessmentItem>;
        assert.equal(favsList.items.length, 1);

        const internalSummaryRes: Response = await app.request(
            `/api/v1/internal/assessments/${publicExam.id}/summary`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(internalSummaryRes.status, 200);
        const summary: InternalAssessmentSummary =
            (await internalSummaryRes.json()) as InternalAssessmentSummary;
        assert.equal(summary.id, publicExam.id);
        assert.equal(summary.total_points, 5);

        const internalGradingRes: Response = await app.request(
            `/api/v1/internal/assessments/${publicExam.id}/grading-data?version=1`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(internalGradingRes.status, 200);
        const gradingData: InternalGradingDataResponse =
            (await internalGradingRes.json()) as InternalGradingDataResponse;
        assert.equal(gradingData.answers[0].correct_answer, "A");
        assert.equal(gradingData.has_essay, false);

        const nonAdminRes: Response = await app.request("/api/v1/internal/admin/assessments", {
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": memberId,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(nonAdminRes.status, 403);

        const adminListRes: Response = await app.request(
            "/api/v1/internal/admin/assessments?search=biology",
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                }
            }
        );
        assert.equal(adminListRes.status, 200);
        const adminList: PaginatedResult<AdminAssessmentRecord> =
            (await adminListRes.json()) as PaginatedResult<AdminAssessmentRecord>;
        assert.equal(adminList.items.length, 1);

        const hideWithoutReasonRes: Response = await app.request(
            `/api/v1/internal/admin/assessments/${publicExam.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: AssessmentStatus.HIDDEN })
            }
        );
        assert.equal(hideWithoutReasonRes.status, 400);

        const hideRes: Response = await app.request(
            `/api/v1/internal/admin/assessments/${publicExam.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({
                    status: AssessmentStatus.HIDDEN,
                    reason: "Leaked answer keys"
                })
            }
        );
        assert.equal(hideRes.status, 200);
        const hiddenRecord: AdminAssessmentRecord = (await hideRes.json()) as AdminAssessmentRecord;
        assert.equal(hiddenRecord.status, AssessmentStatus.HIDDEN);
        assert.equal(hiddenRecord.moderation_reason, "Leaked answer keys");

        const memberBlockedReadRes: Response = await app.request(
            `/api/v1/internal/assessments/${publicExam.id}`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(memberBlockedReadRes.status, 403);

        const restoreRes: Response = await app.request(
            `/api/v1/internal/admin/assessments/${publicExam.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: AssessmentStatus.ACTIVE })
            }
        );
        assert.equal(restoreRes.status, 200);
        const restoredRecord: AdminAssessmentRecord =
            (await restoreRes.json()) as AdminAssessmentRecord;
        assert.equal(restoredRecord.moderation_reason, null);

        const unfavRes: Response = await app.request(
            `/api/v1/internal/assessments/${publicExam.id}/favorite`,
            {
                method: "DELETE",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(unfavRes.status, 200);
        assert.equal(state.favorites.length, 0);

        const adminDeleteRes: Response = await app.request(
            `/api/v1/internal/admin/assessments/${publicExam.id}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ reason: "Policy removal" })
            }
        );
        assert.equal(adminDeleteRes.status, 204);
        assert.ok(state.assessments[0].deletedAt !== null);

        const ownerDeleteDraftRes: Response = await app.request(
            `/api/v1/internal/assessments/${draftExam.id}`,
            {
                method: "DELETE",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": moderatorId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(ownerDeleteDraftRes.status, 204);
        assert.ok(state.assessments[1].deletedAt !== null);
    });
});
