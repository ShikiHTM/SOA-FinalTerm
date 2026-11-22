import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { createApp } from "../src/app";
import type { AdminContestRecord } from "../src/contests/contest.admin";
import type {
    ContestParticipationInfo,
    ContestSummary,
    InternalSubmissionContext
} from "../src/contests/contest.core";
import { ContestSchema, type ContestEntity } from "../src/db/entities/contest.entity";
import { closeDB, createMikroOrmConfig, forkEm, getORM } from "../src/db/orm";
import type {
    AssessmentSummaryInfo,
    GroupMembershipInfo,
    ServiceClients
} from "../src/shared/clients";
import type { EnvConfig } from "../src/shared/env";
import { AppError } from "../src/shared/errors";
import {
    AssessmentStatus,
    AssessmentVisibility,
    ContestPhase,
    ContestStatus,
    ContestSubmissionPolicy,
    ContestVisibility,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility,
    UserSystemRole,
    type PaginatedResult
} from "../src/shared/types";

interface MockDatabaseState {
    contests: ContestEntity[];
}

function createTestEnv(): EnvConfig {
    return {
        port: 8004,
        dbHost: "localhost",
        dbPort: 5004,
        dbUser: "contest_service",
        dbPassword: "contest_service_dev",
        dbName: "contest_db",
        dbSyncSchema: false,
        internalServiceSecret: "test-internal-secret-123",
        groupServiceUrl: "http://group-service.local",
        assessmentServiceUrl: "http://assessment-service.local",
        corsAllowedOrigins: ["http://localhost:8080"]
    };
}

function matchesContestFilter(contest: ContestEntity, where: Record<string, unknown>): boolean {
    if ("id" in where && contest.id !== where.id) {
        return false;
    }
    if ("deletedAt" in where && where.deletedAt === null && contest.deletedAt !== null) {
        return false;
    }
    if ("groupId" in where && contest.groupId !== where.groupId) {
        return false;
    }
    if ("visibility" in where && contest.visibility !== where.visibility) {
        return false;
    }
    if ("status" in where && contest.status !== where.status) {
        return false;
    }
    if ("startTime" in where && typeof where.startTime === "object" && where.startTime !== null) {
        const range = where.startTime as { $gt?: Date; $lte?: Date };
        if (range.$gt && !(contest.startTime.getTime() > range.$gt.getTime())) {
            return false;
        }
        if (range.$lte && !(contest.startTime.getTime() <= range.$lte.getTime())) {
            return false;
        }
    }
    if ("endTime" in where && typeof where.endTime === "object" && where.endTime !== null) {
        const range = where.endTime as { $gt?: Date; $lte?: Date };
        if (range.$gt && !(contest.endTime.getTime() > range.$gt.getTime())) {
            return false;
        }
        if (range.$lte && !(contest.endTime.getTime() <= range.$lte.getTime())) {
            return false;
        }
    }
    if ("$or" in where && Array.isArray(where.$or)) {
        const matched = where.$or.some((clause: unknown): boolean => {
            if (typeof clause !== "object" || clause === null) {
                return false;
            }
            const record = clause as Record<string, { $ilike?: string }>;
            if (record.title?.$ilike) {
                const needle = record.title.$ilike.replace(/%/g, "").toLowerCase();
                if (contest.title.toLowerCase().includes(needle)) {
                    return true;
                }
            }
            if (record.description?.$ilike) {
                const needle = record.description.$ilike.replace(/%/g, "").toLowerCase();
                if (contest.description.toLowerCase().includes(needle)) {
                    return true;
                }
            }
            return false;
        });
        if (!matched) {
            return false;
        }
    }
    return true;
}

function createMockEntityManager(state: MockDatabaseState): EntityManager {
    const pendingPersisted: ContestEntity[] = [];

    const mockEm = {
        async findOne(
            _entity: unknown,
            where: Record<string, unknown>
        ): Promise<ContestEntity | null> {
            return state.contests.find((item): boolean => matchesContestFilter(item, where)) ?? null;
        },

        async findAndCount(
            _entity: unknown,
            where: Record<string, unknown>,
            options?: {
                orderBy?: Record<string, "ASC" | "DESC">;
                limit?: number;
                offset?: number;
            }
        ): Promise<[ContestEntity[], number]> {
            const matched = state.contests.filter((item): boolean =>
                matchesContestFilter(item, where)
            );
            const sorted = [...matched].sort((left, right): number => {
                if (options?.orderBy?.startTime === "DESC") {
                    return right.startTime.getTime() - left.startTime.getTime();
                }
                return right.createdAt.getTime() - left.createdAt.getTime();
            });
            const total = sorted.length;
            const offset = options?.offset ?? 0;
            const limit = options?.limit ?? total;
            return [sorted.slice(offset, offset + limit), total];
        },

        create(_entity: unknown, data: Record<string, unknown>): ContestEntity {
            const now = new Date();
            return {
                id: typeof data.id === "string" ? data.id : v4(),
                groupId: data.groupId as string,
                assessmentId: data.assessmentId as string,
                assessmentVersion: (data.assessmentVersion as number | undefined) ?? 1,
                organizerId: data.organizerId as string,
                title: data.title as string,
                description: (data.description as string | undefined) ?? "",
                visibility:
                    (data.visibility as ContestVisibility | undefined) ?? ContestVisibility.PRIVATE,
                startTime: data.startTime as Date,
                endTime: data.endTime as Date,
                submissionPolicy:
                    (data.submissionPolicy as ContestSubmissionPolicy | undefined) ??
                    ContestSubmissionPolicy.SINGLE,
                status: (data.status as ContestStatus | undefined) ?? ContestStatus.DRAFT,
                moderationReason: (data.moderationReason as string | null | undefined) ?? null,
                moderatedBy: (data.moderatedBy as string | null | undefined) ?? null,
                moderatedAt: (data.moderatedAt as Date | null | undefined) ?? null,
                deletedAt: (data.deletedAt as Date | null | undefined) ?? null,
                deletedBy: (data.deletedBy as string | null | undefined) ?? null,
                createdAt: now,
                updatedAt: now
            };
        },

        persist(entity: unknown): EntityManager {
            pendingPersisted.push(entity as ContestEntity);
            return mockEm as unknown as EntityManager;
        },

        async flush(): Promise<void> {
            while (pendingPersisted.length > 0) {
                const nextEntity = pendingPersisted.shift();
                if (nextEntity && !state.contests.includes(nextEntity)) {
                    state.contests.push(nextEntity);
                }
            }
        }
    };

    return mockEm as unknown as EntityManager;
}

function createTestHarness(options?: {
    memberships?: Record<string, GroupMembershipInfo>;
    assessments?: Record<string, AssessmentSummaryInfo>;
}): {
    app: ReturnType<typeof createApp>;
    state: MockDatabaseState;
    env: EnvConfig;
    forkCount: () => number;
} {
    const env = createTestEnv();
    const state: MockDatabaseState = { contests: [] };
    const memberships = options?.memberships ?? {};
    const assessments = options?.assessments ?? {};
    let forks = 0;

    const clients: ServiceClients = {
        async getGroupMembership(groupId: string, userId: string): Promise<GroupMembershipInfo> {
            const found = memberships[`${groupId}:${userId}`];
            if (found) {
                return found;
            }
            const groupFound = Object.values(memberships).find(
                (item): boolean => item.group_id === groupId
            );
            if (!groupFound) {
                throw AppError.notFound("GROUP_NOT_FOUND", "Group not found.");
            }
            return {
                group_id: groupId,
                user_id: userId,
                group_status: groupFound.group_status,
                visibility: groupFound.visibility,
                is_member: false,
                is_banned: false,
                role: null,
                can_manage: false,
                is_owner: false
            };
        },

        async getAssessmentSummary(assessmentId: string): Promise<AssessmentSummaryInfo> {
            const found = assessments[assessmentId];
            if (!found) {
                throw AppError.notFound("ASSESSMENT_NOT_FOUND", "Assessment not found.");
            }
            return found;
        }
    };

    const app = createApp({
        env,
        forkEntityManager: (): EntityManager => {
            forks += 1;
            return createMockEntityManager(state);
        },
        clients
    });

    return {
        app,
        state,
        env,
        forkCount: (): number => forks
    };
}

describe("contest-service ORM, CRUD, eligibility, submission-context, and admin routes", (): void => {
    it("enforces module-level MikroORM singleton guard and fork helper", async (): Promise<void> => {
        await closeDB();
        assert.throws((): void => {
            getORM();
        }, /MikroORM has not been initialized/);
        assert.throws((): void => {
            forkEm();
        }, /MikroORM has not been initialized/);
    });

    it("generates complete PostgreSQL DDL directly from MikroORM entities", async (): Promise<void> => {
        const orm = await MikroORM.init({
            ...createMikroOrmConfig(createTestEnv()),
            connect: false
        });
        try {
            const ddl = await orm.schema.getCreateSchemaSQL();
            assert.match(ddl, /create table "contests"/i);
            assert.match(ddl, /contest_visibility/i);
            assert.match(ddl, /contest_submission_policy/i);
            assert.match(ddl, /contest_status/i);
            assert.match(ddl, /"assessment_version"/i);
            assert.match(ddl, /"start_time"/i);
            assert.match(ddl, /"end_time"/i);
        } finally {
            await orm.close(true);
        }
    });

    it("enforces X-Internal-Secret, CORS preflight, and EntityManager per-request forking", async (): Promise<void> => {
        const { app, env, forkCount } = createTestHarness();

        const healthRes = await app.request("/health");
        assert.equal(healthRes.status, 200);
        assert.deepEqual(await healthRes.json(), { status: "ok", service: "contest-service" });

        const preflightRes = await app.request("/api/v1/internal/contests", {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:8080",
                "Access-Control-Request-Method": "GET"
            }
        });
        assert.equal(preflightRes.status, 204);
        assert.equal(preflightRes.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080");

        const missingSecretRes = await app.request("/api/v1/internal/contests");
        assert.equal(missingSecretRes.status, 401);

        const wrongSecretRes = await app.request("/api/v1/internal/contests", {
            headers: { "X-Internal-Secret": "wrong-secret" }
        });
        assert.equal(wrongSecretRes.status, 403);

        await app.request("/api/v1/internal/contests", {
            headers: { "X-Internal-Secret": env.internalServiceSecret }
        });
        await app.request("/api/v1/internal/contests", {
            headers: { "X-Internal-Secret": env.internalServiceSecret }
        });
        assert.equal(forkCount(), 2);
    });

    it("creates contests with group manager and assessment verification, pins assessment version, updates rules, cancels, and deletes", async (): Promise<void> => {
        const groupId = v4();
        const otherGroupId = v4();
        const managerId = v4();
        const memberId = v4();
        const draftAssessmentId = v4();
        const foreignAssessmentId = v4();
        const readyAssessmentId = v4();
        const hiddenAssessmentId = v4();

        const { app, state, env } = createTestHarness({
            memberships: {
                [`${groupId}:${managerId}`]: {
                    group_id: groupId,
                    user_id: managerId,
                    group_status: GroupStatus.ACTIVE,
                    visibility: GroupVisibility.PUBLIC,
                    is_member: true,
                    is_banned: false,
                    role: GroupMemberRole.MODERATOR,
                    can_manage: true,
                    is_owner: false
                },
                [`${groupId}:${memberId}`]: {
                    group_id: groupId,
                    user_id: memberId,
                    group_status: GroupStatus.ACTIVE,
                    visibility: GroupVisibility.PUBLIC,
                    is_member: true,
                    is_banned: false,
                    role: GroupMemberRole.MEMBER,
                    can_manage: false,
                    is_owner: false
                }
            },
            assessments: {
                [draftAssessmentId]: {
                    id: draftAssessmentId,
                    group_id: groupId,
                    created_by: managerId,
                    assessment_type: "MULTI_CHOICE",
                    version: 2,
                    question_count: 10,
                    total_points: 100,
                    has_essay_items: false,
                    has_answer_key: true,
                    is_practice_enabled: false,
                    visibility: AssessmentVisibility.DRAFT,
                    status: AssessmentStatus.ACTIVE
                },
                [foreignAssessmentId]: {
                    id: foreignAssessmentId,
                    group_id: otherGroupId,
                    created_by: managerId,
                    assessment_type: "MULTI_CHOICE",
                    version: 1,
                    question_count: 5,
                    total_points: 50,
                    has_essay_items: false,
                    has_answer_key: true,
                    is_practice_enabled: false,
                    visibility: AssessmentVisibility.PUBLIC,
                    status: AssessmentStatus.ACTIVE
                },
                [hiddenAssessmentId]: {
                    id: hiddenAssessmentId,
                    group_id: groupId,
                    created_by: managerId,
                    assessment_type: "MULTI_CHOICE",
                    version: 1,
                    question_count: 5,
                    total_points: 50,
                    has_essay_items: false,
                    has_answer_key: true,
                    is_practice_enabled: false,
                    visibility: AssessmentVisibility.PUBLIC,
                    status: AssessmentStatus.HIDDEN
                },
                [readyAssessmentId]: {
                    id: readyAssessmentId,
                    group_id: groupId,
                    created_by: managerId,
                    assessment_type: "HYBRID",
                    version: 4,
                    question_count: 12,
                    total_points: 100,
                    has_essay_items: true,
                    has_answer_key: true,
                    is_practice_enabled: false,
                    visibility: AssessmentVisibility.PUBLIC,
                    status: AssessmentStatus.ACTIVE
                }
            }
        });

        const futureStart = new Date(Date.now() + 3600_000).toISOString();
        const futureEnd = new Date(Date.now() + 7200_000).toISOString();

        const nonManagerCreateRes = await app.request("/api/v1/internal/contests", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": memberId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                group_id: groupId,
                assessment_id: readyAssessmentId,
                title: "Unauthorized Contest",
                start_time: futureStart,
                end_time: futureEnd
            })
        });
        assert.equal(nonManagerCreateRes.status, 403);

        const wrongGroupAssessmentRes = await app.request("/api/v1/internal/contests", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                group_id: groupId,
                assessment_id: foreignAssessmentId,
                title: "Cross-group Contest",
                start_time: futureStart,
                end_time: futureEnd
            })
        });
        assert.equal(wrongGroupAssessmentRes.status, 400);

        const publishDraftAssessmentRes = await app.request("/api/v1/internal/contests", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                group_id: groupId,
                assessment_id: draftAssessmentId,
                title: "Publish With Draft Assessment",
                start_time: futureStart,
                end_time: futureEnd,
                status: ContestStatus.PUBLISHED
            })
        });
        assert.equal(publishDraftAssessmentRes.status, 400);

        const hiddenAssessmentRes = await app.request("/api/v1/internal/contests", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                group_id: groupId,
                assessment_id: hiddenAssessmentId,
                title: "Hidden Assessment Contest",
                start_time: futureStart,
                end_time: futureEnd
            })
        });
        assert.equal(hiddenAssessmentRes.status, 400);

        const createRes = await app.request("/api/v1/internal/contests", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                group_id: groupId,
                assessment_id: readyAssessmentId,
                title: "Midterm Algorithms",
                description: "Scheduled exam",
                visibility: ContestVisibility.PUBLIC,
                start_time: futureStart,
                end_time: futureEnd,
                submission_policy: ContestSubmissionPolicy.MULTIPLE,
                status: ContestStatus.PUBLISHED
            })
        });
        assert.equal(createRes.status, 201);
        const created = (await createRes.json()) as ContestSummary;
        assert.equal(created.assessment_version, 4);
        assert.equal(created.phase, ContestPhase.UPCOMING);
        assert.equal(created.status, ContestStatus.PUBLISHED);

        const updateUpcomingRes = await app.request(`/api/v1/internal/contests/${created.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                title: "Midterm Algorithms Finalized",
                submission_policy: ContestSubmissionPolicy.SINGLE
            })
        });
        assert.equal(updateUpcomingRes.status, 200);
        const updated = (await updateUpcomingRes.json()) as ContestSummary;
        assert.equal(updated.title, "Midterm Algorithms Finalized");
        assert.equal(updated.submission_policy, ContestSubmissionPolicy.SINGLE);

        state.contests[0].startTime = new Date(Date.now() - 600_000);
        state.contests[0].endTime = new Date(Date.now() + 1800_000);

        const invalidOngoingPatch = await app.request(`/api/v1/internal/contests/${created.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                submission_policy: ContestSubmissionPolicy.MULTIPLE
            })
        });
        assert.equal(invalidOngoingPatch.status, 409);

        const deleteOngoingRes = await app.request(`/api/v1/internal/contests/${created.id}`, {
            method: "DELETE",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(deleteOngoingRes.status, 409);

        const extendOngoingRes = await app.request(`/api/v1/internal/contests/${created.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                end_time: new Date(Date.now() + 3600_000).toISOString()
            })
        });
        assert.equal(extendOngoingRes.status, 200);

        const cancelRes = await app.request(`/api/v1/internal/contests/${created.id}/cancel`, {
            method: "POST",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(cancelRes.status, 200);
        const cancelled = (await cancelRes.json()) as ContestSummary;
        assert.equal(cancelled.status, ContestStatus.CANCELLED);
        assert.equal(cancelled.phase, ContestPhase.CANCELLED);

        const editCancelledRes = await app.request(`/api/v1/internal/contests/${created.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({ title: "Should fail" })
        });
        assert.equal(editCancelledRes.status, 409);

        const deleteCancelledRes = await app.request(`/api/v1/internal/contests/${created.id}`, {
            method: "DELETE",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": managerId,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(deleteCancelledRes.status, 204);
        assert.ok(state.contests[0].deletedAt !== null);
    });

    it("supports guest public browsing, group visibility filtering, participation check, and internal submission context", async (): Promise<void> => {
        const publicGroupId = v4();
        const privateGroupId = v4();
        const organizerId = v4();
        const memberId = v4();
        const outsiderId = v4();
        const bannedId = v4();

        const { app, state, env } = createTestHarness({
            memberships: {
                [`${publicGroupId}:${memberId}`]: {
                    group_id: publicGroupId,
                    user_id: memberId,
                    group_status: GroupStatus.ACTIVE,
                    visibility: GroupVisibility.PUBLIC,
                    is_member: true,
                    is_banned: false,
                    role: GroupMemberRole.MEMBER,
                    can_manage: false,
                    is_owner: false
                },
                [`${privateGroupId}:${memberId}`]: {
                    group_id: privateGroupId,
                    user_id: memberId,
                    group_status: GroupStatus.ACTIVE,
                    visibility: GroupVisibility.PRIVATE,
                    is_member: true,
                    is_banned: false,
                    role: GroupMemberRole.MEMBER,
                    can_manage: false,
                    is_owner: false
                },
                [`${publicGroupId}:${bannedId}`]: {
                    group_id: publicGroupId,
                    user_id: bannedId,
                    group_status: GroupStatus.ACTIVE,
                    visibility: GroupVisibility.PUBLIC,
                    is_member: false,
                    is_banned: true,
                    role: null,
                    can_manage: false,
                    is_owner: false
                }
            }
        });

        const em = createMockEntityManager(state);
        const now = Date.now();

        const ongoingPublicContest = em.create(ContestSchema, {
            id: v4(),
            groupId: publicGroupId,
            assessmentId: v4(),
            assessmentVersion: 3,
            organizerId,
            title: "Open Weekly Contest",
            description: "Public ongoing round",
            visibility: ContestVisibility.PUBLIC,
            startTime: new Date(now - 900_000),
            endTime: new Date(now + 900_000),
            submissionPolicy: ContestSubmissionPolicy.MULTIPLE,
            status: ContestStatus.PUBLISHED
        });
        const upcomingPrivateContest = em.create(ContestSchema, {
            id: v4(),
            groupId: privateGroupId,
            assessmentId: v4(),
            assessmentVersion: 1,
            organizerId,
            title: "Private Group Quiz",
            description: "Members only",
            visibility: ContestVisibility.PRIVATE,
            startTime: new Date(now + 900_000),
            endTime: new Date(now + 3600_000),
            submissionPolicy: ContestSubmissionPolicy.SINGLE,
            status: ContestStatus.PUBLISHED
        });
        const draftContest = em.create(ContestSchema, {
            id: v4(),
            groupId: publicGroupId,
            assessmentId: v4(),
            assessmentVersion: 1,
            organizerId,
            title: "Secret Draft Contest",
            description: "Hidden draft",
            visibility: ContestVisibility.PUBLIC,
            startTime: new Date(now + 900_000),
            endTime: new Date(now + 3600_000),
            submissionPolicy: ContestSubmissionPolicy.SINGLE,
            status: ContestStatus.DRAFT
        });
        state.contests.push(ongoingPublicContest, upcomingPrivateContest, draftContest);

        const guestBrowseRes = await app.request(
            `/api/v1/internal/contests?phase=${ContestPhase.ONGOING}&search=Weekly`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(guestBrowseRes.status, 200);
        const guestBrowse = (await guestBrowseRes.json()) as PaginatedResult<ContestSummary>;
        assert.equal(guestBrowse.items.length, 1);
        assert.equal(guestBrowse.items[0].id, ongoingPublicContest.id);

        const guestPrivateRes = await app.request(
            `/api/v1/internal/contests/${upcomingPrivateContest.id}`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(guestPrivateRes.status, 403);

        const outsiderPrivateListRes = await app.request(
            `/api/v1/internal/contests?group_id=${privateGroupId}`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": outsiderId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(outsiderPrivateListRes.status, 403);

        const memberParticipationRes = await app.request(
            `/api/v1/internal/contests/${ongoingPublicContest.id}/participation`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(memberParticipationRes.status, 200);
        const memberParticipation =
            (await memberParticipationRes.json()) as ContestParticipationInfo;
        assert.equal(memberParticipation.can_participate, true);
        assert.equal(memberParticipation.denial_reason, null);
        assert.equal(memberParticipation.phase, ContestPhase.ONGOING);

        const upcomingParticipationRes = await app.request(
            `/api/v1/internal/contests/${upcomingPrivateContest.id}/participation`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": memberId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(upcomingParticipationRes.status, 200);
        const upcomingParticipation =
            (await upcomingParticipationRes.json()) as ContestParticipationInfo;
        assert.equal(upcomingParticipation.can_participate, false);
        assert.equal(upcomingParticipation.denial_reason, "CONTEST_NOT_STARTED");

        const submissionCtxAllowedRes = await app.request(
            `/api/v1/internal/contests/${ongoingPublicContest.id}/submission-context?user_id=${memberId}`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(submissionCtxAllowedRes.status, 200);
        const submissionCtxAllowed =
            (await submissionCtxAllowedRes.json()) as InternalSubmissionContext;
        assert.equal(submissionCtxAllowed.can_submit, true);
        assert.equal(submissionCtxAllowed.assessment_version, 3);
        assert.equal(submissionCtxAllowed.evaluation_rule, "FINAL_ATTEMPT_ONLY");

        const submissionCtxBannedRes = await app.request(
            `/api/v1/internal/contests/${ongoingPublicContest.id}/submission-context?user_id=${bannedId}`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(submissionCtxBannedRes.status, 200);
        const submissionCtxBanned =
            (await submissionCtxBannedRes.json()) as InternalSubmissionContext;
        assert.equal(submissionCtxBanned.can_submit, false);
        assert.equal(submissionCtxBanned.denial_reason, "GROUP_BANNED");
    });

    it("supports admin moderation (listing, unpublishing/cancelling with required reason, restoring, and deletion)", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const em = createMockEntityManager(state);
        const adminId = v4();
        const normalUserId = v4();

        const contest = em.create(ContestSchema, {
            id: v4(),
            groupId: v4(),
            assessmentId: v4(),
            assessmentVersion: 1,
            organizerId: normalUserId,
            title: "National Olympiad Practice",
            description: "Platform contest",
            visibility: ContestVisibility.PUBLIC,
            startTime: new Date(Date.now() + 3600_000),
            endTime: new Date(Date.now() + 7200_000),
            submissionPolicy: ContestSubmissionPolicy.SINGLE,
            status: ContestStatus.PUBLISHED
        });
        state.contests.push(contest);

        const nonAdminRes = await app.request("/api/v1/internal/admin/contests", {
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": normalUserId,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(nonAdminRes.status, 403);

        const adminListRes = await app.request(
            "/api/v1/internal/admin/contests?search=Olympiad&status=PUBLISHED",
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                }
            }
        );
        assert.equal(adminListRes.status, 200);
        const adminList = (await adminListRes.json()) as PaginatedResult<AdminContestRecord>;
        assert.equal(adminList.items.length, 1);

        const missingReasonRes = await app.request(
            `/api/v1/internal/admin/contests/${contest.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: ContestStatus.DRAFT })
            }
        );
        assert.equal(missingReasonRes.status, 400);

        const unpublishRes = await app.request(
            `/api/v1/internal/admin/contests/${contest.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({
                    status: ContestStatus.DRAFT,
                    reason: "Schedule mismatch under review"
                })
            }
        );
        assert.equal(unpublishRes.status, 200);
        const unpublished = (await unpublishRes.json()) as AdminContestRecord;
        assert.equal(unpublished.status, ContestStatus.DRAFT);
        assert.equal(unpublished.moderation_reason, "Schedule mismatch under review");
        assert.equal(unpublished.moderated_by, adminId);

        const restoreRes = await app.request(
            `/api/v1/internal/admin/contests/${contest.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: ContestStatus.PUBLISHED })
            }
        );
        assert.equal(restoreRes.status, 200);
        const restored = (await restoreRes.json()) as AdminContestRecord;
        assert.equal(restored.status, ContestStatus.PUBLISHED);
        assert.equal(restored.moderation_reason, null);

        const adminDeleteRes = await app.request(`/api/v1/internal/admin/contests/${contest.id}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": adminId,
                "X-User-Role": UserSystemRole.ADMIN
            },
            body: JSON.stringify({ reason: "Duplicate event" })
        });
        assert.equal(adminDeleteRes.status, 204);
        assert.ok(state.contests[0].deletedAt !== null);
        assert.equal(state.contests[0].moderationReason, "Duplicate event");
    });
});
