import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";
import { createApp } from "../src/app";
import { GroupBanSchema, type GroupBanEntity } from "../src/db/entities/group-ban.entity";
import {
    GroupJoinRequestSchema,
    type GroupJoinRequestEntity
} from "../src/db/entities/group-join-request.entity";
import { GroupMemberSchema, type GroupMemberEntity } from "../src/db/entities/group-member.entity";
import { GroupSchema, type GroupEntity } from "../src/db/entities/group.entity";
import { closeDB, createMikroOrmConfig, forkEm, getORM } from "../src/db/orm";
import type { AdminGroupRecord } from "../src/groups/group.admin";
import type { GroupSummary } from "../src/groups/group.core";
import type {
    GroupBanRecord,
    GroupMemberRecord,
    InternalGroupMembership,
    JoinRequestRecord
} from "../src/groups/group.membership";
import type { EnvConfig } from "../src/shared/env";
import {
    GroupJoinPolicy,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility,
    JoinRequestStatus,
    UserSystemRole,
    type PaginatedResult,
    type PaginationMeta
} from "../src/shared/types";

interface MockDatabaseState {
    groups: GroupEntity[];
    members: GroupMemberEntity[];
    joinRequests: GroupJoinRequestEntity[];
    bans: GroupBanEntity[];
    forkCount: number;
}

class InMemoryGroupEntityManager {
    private readonly state: MockDatabaseState;
    private readonly pendingPersists: unknown[] = [];
    private readonly pendingRemovals: unknown[] = [];

    public constructor(state: MockDatabaseState) {
        this.state = state;
    }

    public create(schema: unknown, data: Record<string, unknown>): unknown {
        const now: Date = new Date();
        if (schema === GroupSchema) {
            const group: GroupEntity = {
                id: (data.id as string | undefined) ?? v4(),
                groupCode: data.groupCode as string,
                name: data.name as string,
                description: (data.description as string | undefined) ?? "",
                visibility: data.visibility as GroupVisibility,
                joinPolicy: data.joinPolicy as GroupJoinPolicy,
                joinPasswordHash: (data.joinPasswordHash as string | null | undefined) ?? null,
                ownerId: data.ownerId as string,
                status: (data.status as GroupStatus | undefined) ?? GroupStatus.ACTIVE,
                moderationReason: (data.moderationReason as string | null | undefined) ?? null,
                moderatedBy: (data.moderatedBy as string | null | undefined) ?? null,
                moderatedAt: (data.moderatedAt as Date | null | undefined) ?? null,
                deletedAt: (data.deletedAt as Date | null | undefined) ?? null,
                deletedBy: (data.deletedBy as string | null | undefined) ?? null,
                createdAt: (data.createdAt as Date | undefined) ?? now,
                updatedAt: (data.updatedAt as Date | undefined) ?? now
            };
            return group;
        }
        if (schema === GroupMemberSchema) {
            const member: GroupMemberEntity = {
                group: data.group as GroupEntity,
                userId: data.userId as string,
                role: (data.role as GroupMemberRole | undefined) ?? GroupMemberRole.MEMBER,
                joinedAt: (data.joinedAt as Date | undefined) ?? now,
                updatedAt: (data.updatedAt as Date | undefined) ?? now
            };
            return member;
        }
        if (schema === GroupJoinRequestSchema) {
            const request: GroupJoinRequestEntity = {
                id: (data.id as string | undefined) ?? v4(),
                group: data.group as GroupEntity,
                userId: data.userId as string,
                status: (data.status as JoinRequestStatus | undefined) ?? JoinRequestStatus.PENDING,
                reviewedBy: (data.reviewedBy as string | null | undefined) ?? null,
                reviewedAt: (data.reviewedAt as Date | null | undefined) ?? null,
                createdAt: (data.createdAt as Date | undefined) ?? now
            };
            return request;
        }
        if (schema === GroupBanSchema) {
            const ban: GroupBanEntity = {
                id: (data.id as string | undefined) ?? v4(),
                group: data.group as GroupEntity,
                userId: data.userId as string,
                reason: (data.reason as string | null | undefined) ?? null,
                bannedBy: data.bannedBy as string,
                bannedAt: (data.bannedAt as Date | undefined) ?? now,
                revokedAt: (data.revokedAt as Date | null | undefined) ?? null
            };
            return ban;
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
        for (const entity of this.pendingPersists) {
            if (this.isGroupEntity(entity) && !this.state.groups.includes(entity)) {
                this.state.groups.push(entity);
            } else if (this.isMemberEntity(entity) && !this.state.members.includes(entity)) {
                this.state.members.push(entity);
            } else if (
                this.isJoinRequestEntity(entity) &&
                !this.state.joinRequests.includes(entity)
            ) {
                this.state.joinRequests.push(entity);
            } else if (this.isBanEntity(entity) && !this.state.bans.includes(entity)) {
                this.state.bans.push(entity);
            }
        }
        for (const entity of this.pendingRemovals) {
            this.state.groups = this.state.groups.filter(
                (item: GroupEntity): boolean => item !== entity
            );
            this.state.members = this.state.members.filter(
                (item: GroupMemberEntity): boolean => item !== entity
            );
            this.state.joinRequests = this.state.joinRequests.filter(
                (item: GroupJoinRequestEntity): boolean => item !== entity
            );
            this.state.bans = this.state.bans.filter(
                (item: GroupBanEntity): boolean => item !== entity
            );
        }
        this.pendingPersists.length = 0;
        this.pendingRemovals.length = 0;
    }

    public async findOne(schema: unknown, where: Record<string, unknown>): Promise<unknown> {
        const matches: unknown[] = await this.find(schema, where);
        return matches[0] ?? null;
    }

    public async count(schema: unknown, where: Record<string, unknown>): Promise<number> {
        const matches: unknown[] = await this.find(schema, where);
        return matches.length;
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
        if (schema === GroupSchema) {
            results = this.state.groups.filter((group: GroupEntity): boolean =>
                this.matchesGroupWhere(group, where)
            );
        } else if (schema === GroupMemberSchema) {
            results = this.state.members.filter((member: GroupMemberEntity): boolean => {
                if (typeof where.group === "string" && member.group.id !== where.group) {
                    return false;
                }
                if (typeof where.userId === "string" && member.userId !== where.userId) {
                    return false;
                }
                if (where.role !== undefined && member.role !== where.role) {
                    return false;
                }
                return true;
            });
        } else if (schema === GroupJoinRequestSchema) {
            results = this.state.joinRequests.filter((request: GroupJoinRequestEntity): boolean => {
                if (where.id !== undefined && request.id !== where.id) {
                    return false;
                }
                if (typeof where.group === "string" && request.group.id !== where.group) {
                    return false;
                }
                if (typeof where.userId === "string" && request.userId !== where.userId) {
                    return false;
                }
                if (where.status !== undefined && request.status !== where.status) {
                    return false;
                }
                return true;
            });
        } else if (schema === GroupBanSchema) {
            results = this.state.bans.filter((ban: GroupBanEntity): boolean => {
                if (typeof where.group === "string" && ban.group.id !== where.group) {
                    return false;
                }
                if (typeof where.userId === "string" && ban.userId !== where.userId) {
                    return false;
                }
                if (where.revokedAt === null && ban.revokedAt !== null) {
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
        if (typeof condition === "object" && condition !== null && "$ilike" in condition) {
            const rawPattern: string = (condition.$ilike as string)
                .replace(/^%|%$/g, "")
                .toLowerCase();
            return value.toLowerCase().includes(rawPattern);
        }
        return true;
    }

    private matchesGroupWhere(group: GroupEntity, where: Record<string, unknown>): boolean {
        if (where.deletedAt === null && group.deletedAt !== null) {
            return false;
        }
        if (where.id !== undefined && group.id !== where.id) {
            return false;
        }
        if (
            where.groupCode !== undefined &&
            !this.matchesStringCondition(group.groupCode, where.groupCode)
        ) {
            return false;
        }
        if (where.name !== undefined && !this.matchesStringCondition(group.name, where.name)) {
            return false;
        }
        if (
            where.description !== undefined &&
            !this.matchesStringCondition(group.description, where.description)
        ) {
            return false;
        }
        if (where.visibility !== undefined && group.visibility !== where.visibility) {
            return false;
        }
        if (where.status !== undefined && group.status !== where.status) {
            return false;
        }
        if (Array.isArray(where.$or)) {
            const orList: Record<string, unknown>[] = where.$or as Record<string, unknown>[];
            const anyMatch: boolean = orList.some((clause: Record<string, unknown>): boolean =>
                this.matchesGroupWhere(group, clause)
            );
            if (!anyMatch) {
                return false;
            }
        }
        return true;
    }

    private isGroupEntity(entity: unknown): entity is GroupEntity {
        return typeof entity === "object" && entity !== null && "groupCode" in entity;
    }

    private isMemberEntity(entity: unknown): entity is GroupMemberEntity {
        return (
            typeof entity === "object" &&
            entity !== null &&
            "role" in entity &&
            "joinedAt" in entity
        );
    }

    private isJoinRequestEntity(entity: unknown): entity is GroupJoinRequestEntity {
        return (
            typeof entity === "object" &&
            entity !== null &&
            "group" in entity &&
            "status" in entity &&
            "reviewedAt" in entity
        );
    }

    private isBanEntity(entity: unknown): entity is GroupBanEntity {
        return typeof entity === "object" && entity !== null && "bannedBy" in entity;
    }
}

function createTestEnv(): EnvConfig {
    return {
        port: 8002,
        dbHost: "localhost",
        dbPort: 5002,
        dbUser: "group_service",
        dbPassword: "group_service_dev",
        dbName: "group_db",
        dbSyncSchema: false,
        internalServiceSecret: "test-internal-secret",
        corsAllowedOrigins: ["http://localhost:8080", "http://127.0.0.1:8080"]
    };
}

function createTestHarness(): {
    app: ReturnType<typeof createApp>;
    state: MockDatabaseState;
    env: EnvConfig;
} {
    const env: EnvConfig = createTestEnv();
    const state: MockDatabaseState = {
        groups: [],
        members: [],
        joinRequests: [],
        bans: [],
        forkCount: 0
    };
    const app: ReturnType<typeof createApp> = createApp({
        env,
        forkEntityManager: (): EntityManager => {
            state.forkCount += 1;
            return new InMemoryGroupEntityManager(state) as unknown as EntityManager;
        }
    });
    return { app, state, env };
}

describe("group-service ORM, CRUD, membership policies, roles, bans, and admin routes", (): void => {
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
            assert.match(ddl, /create type "group_visibility" as enum \('PUBLIC', 'PRIVATE'\)/i);
            assert.match(
                ddl,
                /create type "group_join_policy" as enum \('OPEN', 'APPROVAL', 'PASSWORD'\)/i
            );
            assert.match(ddl, /create type "group_status" as enum \('ACTIVE', 'SUSPENDED'\)/i);
            assert.match(
                ddl,
                /create type "group_member_role" as enum \('MEMBER', 'MODERATOR', 'OWNER'\)/i
            );
            assert.match(
                ddl,
                /create type "join_request_status" as enum \('PENDING', 'APPROVED', 'REJECTED'\)/i
            );
            assert.match(ddl, /create table "groups"/i);
            assert.match(ddl, /create table "group_members"/i);
            assert.match(ddl, /create table "group_join_requests"/i);
            assert.match(ddl, /create table "group_bans"/i);
            assert.match(ddl, /chk_groups_visibility_join_policy/i);
            assert.match(ddl, /on delete cascade/i);
        } finally {
            await orm.close(true);
        }
    });

    it("enforces X-Internal-Secret, CORS preflight, and EntityManager per-request forking", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();

        const preflightRes: Response = await app.request("/api/v1/internal/groups", {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:8080",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-Internal-Secret"
            }
        });
        assert.equal(preflightRes.status, 204);
        assert.equal(
            preflightRes.headers.get("Access-Control-Allow-Origin"),
            "http://localhost:8080"
        );
        assert.equal(state.forkCount, 0);

        const missingSecretRes: Response = await app.request("/api/v1/internal/groups");
        assert.equal(missingSecretRes.status, 401);
        assert.equal(state.forkCount, 0);

        const wrongSecretRes: Response = await app.request("/api/v1/internal/groups", {
            headers: { "X-Internal-Secret": "wrong-secret" }
        });
        assert.equal(wrongSecretRes.status, 403);
        assert.equal(state.forkCount, 0);

        const healthRes: Response = await app.request("/health");
        assert.equal(healthRes.status, 200);
        assert.deepEqual(await healthRes.json(), { status: "ok", service: "group-service" });
        assert.equal(state.forkCount, 0);

        const validBrowseRes: Response = await app.request("/api/v1/internal/groups", {
            headers: { "X-Internal-Secret": env.internalServiceSecret }
        });
        assert.equal(validBrowseRes.status, 200);
        assert.equal(state.forkCount, 1);
    });

    it("creates groups with policy validation, bcrypt password hashing, guest lookup, and my-groups listing", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const ownerId: string = v4();

        const invalidPublicRes: Response = await app.request("/api/v1/internal/groups", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                name: "Invalid Public",
                visibility: GroupVisibility.PUBLIC,
                join_policy: GroupJoinPolicy.PASSWORD,
                password: "secret123"
            })
        });
        assert.equal(invalidPublicRes.status, 400);

        const publicRes: Response = await app.request("/api/v1/internal/groups", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                name: "Algorithms 101",
                description: "Open study group",
                visibility: GroupVisibility.PUBLIC,
                join_policy: GroupJoinPolicy.OPEN
            })
        });
        assert.equal(publicRes.status, 201);
        const publicGroup: GroupSummary = (await publicRes.json()) as GroupSummary;
        assert.equal(publicGroup.my_role, GroupMemberRole.OWNER);
        assert.equal(publicGroup.member_count, 1);
        assert.equal("joinPasswordHash" in publicGroup, false);

        const privatePassRes: Response = await app.request("/api/v1/internal/groups", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                name: "Private Exam Prep",
                description: "Shared password group",
                visibility: GroupVisibility.PRIVATE,
                join_policy: GroupJoinPolicy.PASSWORD,
                password: "GroupPass123"
            })
        });
        assert.equal(privatePassRes.status, 201);
        const privateGroup: GroupSummary = (await privatePassRes.json()) as GroupSummary;
        assert.ok(state.groups[1].joinPasswordHash !== null);
        assert.match(state.groups[1].joinPasswordHash, /^\$2[aby]\$12\$/);
        assert.equal(await bcrypt.compare("GroupPass123", state.groups[1].joinPasswordHash), true);

        const browseRes: Response = await app.request(
            `/api/v1/internal/groups?search=alg&visibility=PUBLIC`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(browseRes.status, 200);
        const browseBody: PaginatedResult<GroupSummary> =
            (await browseRes.json()) as PaginatedResult<GroupSummary>;
        assert.equal(browseBody.items.length, 1);
        assert.equal(browseBody.items[0].my_role, null);

        const codeRes: Response = await app.request(
            `/api/v1/internal/groups/code/${privateGroup.group_code.toLowerCase()}`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(codeRes.status, 200);
        const codeGroup: GroupSummary = (await codeRes.json()) as GroupSummary;
        assert.equal(codeGroup.id, privateGroup.id);

        const myGroupsRes: Response = await app.request("/api/v1/internal/groups/me", {
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(myGroupsRes.status, 200);
        const myGroupsBody: PaginatedResult<GroupSummary> =
            (await myGroupsRes.json()) as PaginatedResult<GroupSummary>;
        assert.equal(myGroupsBody.items.length, 2);
        assert.deepEqual(myGroupsBody.pagination, {
            page: 1,
            limit: 20,
            total: 2,
            total_pages: 1
        } satisfies PaginationMeta);
    });

    it("handles direct join, password join, approval requests, removal, bans/unbans, and leaving", async (): Promise<void> => {
        const { app, env } = createTestHarness();
        const ownerId: string = v4();
        const aliceId: string = v4();
        const bobId: string = v4();

        const openGroup: GroupSummary = (await (
            await app.request("/api/v1/internal/groups", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    name: "Open Group",
                    visibility: GroupVisibility.PUBLIC,
                    join_policy: GroupJoinPolicy.OPEN
                })
            })
        ).json()) as GroupSummary;

        const approvalGroup: GroupSummary = (await (
            await app.request("/api/v1/internal/groups", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    name: "Approval Group",
                    visibility: GroupVisibility.PRIVATE,
                    join_policy: GroupJoinPolicy.APPROVAL
                })
            })
        ).json()) as GroupSummary;

        const passwordGroup: GroupSummary = (await (
            await app.request("/api/v1/internal/groups", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    name: "Password Group",
                    visibility: GroupVisibility.PRIVATE,
                    join_policy: GroupJoinPolicy.PASSWORD,
                    password: "SecretPass9"
                })
            })
        ).json()) as GroupSummary;

        const joinOpenRes: Response = await app.request(
            `/api/v1/internal/groups/${openGroup.id}/join`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(joinOpenRes.status, 201);
        const joinedOpen: GroupMemberRecord = (await joinOpenRes.json()) as GroupMemberRecord;
        assert.equal(joinedOpen.role, GroupMemberRole.MEMBER);

        const wrongPassRes: Response = await app.request(
            `/api/v1/internal/groups/${passwordGroup.id}/join`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ password: "WrongPassword" })
            }
        );
        assert.equal(wrongPassRes.status, 403);

        const validPassRes: Response = await app.request(
            `/api/v1/internal/groups/${passwordGroup.id}/join`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ password: "SecretPass9" })
            }
        );
        assert.equal(validPassRes.status, 201);

        const reqRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/requests`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(reqRes.status, 201);
        const createdReq: JoinRequestRecord = (await reqRes.json()) as JoinRequestRecord;

        const duplicateReqRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/requests`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(duplicateReqRes.status, 409);

        const guestMembersPrivateRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/members`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(guestMembersPrivateRes.status, 403);

        const listReqRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/requests?status=PENDING`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(listReqRes.status, 200);
        const reqList: PaginatedResult<JoinRequestRecord> =
            (await listReqRes.json()) as PaginatedResult<JoinRequestRecord>;
        assert.equal(reqList.items.length, 1);

        const approveRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/requests/${createdReq.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ decision: JoinRequestStatus.APPROVED })
            }
        );
        assert.equal(approveRes.status, 200);

        const bobReq: JoinRequestRecord = (await (
            await app.request(`/api/v1/internal/groups/${approvalGroup.id}/requests`, {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bobId,
                    "X-User-Role": UserSystemRole.USER
                }
            })
        ).json()) as JoinRequestRecord;
        const rejectRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/requests/${bobReq.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ decision: JoinRequestStatus.REJECTED })
            }
        );
        assert.equal(rejectRes.status, 200);

        const ownerLeaveRes: Response = await app.request(
            `/api/v1/internal/groups/${openGroup.id}/leave`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(ownerLeaveRes.status, 403);

        const aliceLeaveOpenRes: Response = await app.request(
            `/api/v1/internal/groups/${openGroup.id}/leave`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(aliceLeaveOpenRes.status, 204);

        const banRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/bans`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    user_id: aliceId,
                    reason: "Disruptive behavior"
                })
            }
        );
        assert.equal(banRes.status, 201);
        const banRecord: GroupBanRecord = (await banRes.json()) as GroupBanRecord;
        assert.equal(banRecord.reason, "Disruptive behavior");

        const bannedReRequestRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/requests`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(bannedReRequestRes.status, 403);

        const listBansRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/bans`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(listBansRes.status, 200);
        const bansBody: PaginatedResult<GroupBanRecord> =
            (await listBansRes.json()) as PaginatedResult<GroupBanRecord>;
        assert.equal(bansBody.items.length, 1);

        const unbanRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/bans/${aliceId}`,
            {
                method: "DELETE",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(unbanRes.status, 204);

        const requestAfterUnbanRes: Response = await app.request(
            `/api/v1/internal/groups/${approvalGroup.id}/requests`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": aliceId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(requestAfterUnbanRes.status, 201);
    });

    it("enforces owner permissions for settings, moderator role assignment, ownership transfer, and group deletion", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const ownerId: string = v4();
        const modId: string = v4();
        const memberId: string = v4();

        const group: GroupSummary = (await (
            await app.request("/api/v1/internal/groups", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    name: "Owner Group",
                    visibility: GroupVisibility.PUBLIC,
                    join_policy: GroupJoinPolicy.OPEN
                })
            })
        ).json()) as GroupSummary;

        for (const uid of [modId, memberId]) {
            const joinRes: Response = await app.request(
                `/api/v1/internal/groups/${group.id}/join`,
                {
                    method: "POST",
                    headers: {
                        "X-Internal-Secret": env.internalServiceSecret,
                        "X-User-Id": uid,
                        "X-User-Role": UserSystemRole.USER
                    }
                }
            );
            assert.equal(joinRes.status, 201);
        }

        const promoteRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}/members/${modId}/role`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ role: GroupMemberRole.MODERATOR })
            }
        );
        assert.equal(promoteRes.status, 200);
        const promotedMember: GroupMemberRecord =
            (await promoteRes.json()) as GroupMemberRecord;
        assert.equal(promotedMember.role, GroupMemberRole.MODERATOR);

        const modEditBlockedRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": modId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ name: "Hijacked Name" })
            }
        );
        assert.equal(modEditBlockedRes.status, 403);

        const modRemoveSelfBlockedRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}/members/${ownerId}`,
            {
                method: "DELETE",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": modId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(modRemoveSelfBlockedRes.status, 403);

        const ownerRemoveMemberRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}/members/${memberId}`,
            {
                method: "DELETE",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": modId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(ownerRemoveMemberRes.status, 204);

        const switchToPassRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    name: "Updated Private Group",
                    visibility: GroupVisibility.PRIVATE,
                    join_policy: GroupJoinPolicy.PASSWORD,
                    password: "NewPassword123"
                })
            }
        );
        assert.equal(switchToPassRes.status, 200);
        assert.ok(state.groups[0].joinPasswordHash !== null);

        const switchBackOpenRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    visibility: GroupVisibility.PUBLIC,
                    join_policy: GroupJoinPolicy.OPEN
                })
            }
        );
        assert.equal(switchBackOpenRes.status, 200);
        assert.equal(state.groups[0].joinPasswordHash, null);

        const transferRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}/transfer-ownership`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({ new_owner_id: modId })
            }
        );
        assert.equal(transferRes.status, 200);
        const transferredGroup: GroupSummary = (await transferRes.json()) as GroupSummary;
        assert.equal(transferredGroup.owner_id, modId);
        assert.equal(transferredGroup.my_role, GroupMemberRole.MODERATOR);

        const membersListRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}/members`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        const membersList: PaginatedResult<GroupMemberRecord> =
            (await membersListRes.json()) as PaginatedResult<GroupMemberRecord>;
        assert.equal(membersList.items.length, 2);

        const newOwnerDeleteRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}`,
            {
                method: "DELETE",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": modId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(newOwnerDeleteRes.status, 204);
        assert.ok(state.groups[0].deletedAt !== null);
        assert.equal(state.members.length, 0);
    });

    it("supports admin moderation and internal membership check for sibling services", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const adminId: string = v4();
        const ownerId: string = v4();
        const learnerId: string = v4();

        const group: GroupSummary = (await (
            await app.request("/api/v1/internal/groups", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": ownerId,
                    "X-User-Role": UserSystemRole.USER
                },
                body: JSON.stringify({
                    name: "Physics Group",
                    visibility: GroupVisibility.PUBLIC,
                    join_policy: GroupJoinPolicy.OPEN
                })
            })
        ).json()) as GroupSummary;

        const internalOwnerRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}/members/${ownerId}`,
            {
                headers: { "X-Internal-Secret": env.internalServiceSecret }
            }
        );
        assert.equal(internalOwnerRes.status, 200);
        const internalOwner: InternalGroupMembership =
            (await internalOwnerRes.json()) as InternalGroupMembership;
        assert.deepEqual(internalOwner, {
            group_id: group.id,
            user_id: ownerId,
            group_status: GroupStatus.ACTIVE,
            visibility: GroupVisibility.PUBLIC,
            is_member: true,
            is_banned: false,
            role: GroupMemberRole.OWNER,
            can_manage: true,
            is_owner: true
        } satisfies InternalGroupMembership);

        const nonAdminRes: Response = await app.request("/api/v1/internal/admin/groups", {
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": ownerId,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(nonAdminRes.status, 403);

        const adminListRes: Response = await app.request(
            "/api/v1/internal/admin/groups?search=phys&status=ACTIVE",
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                }
            }
        );
        assert.equal(adminListRes.status, 200);
        const adminList: PaginatedResult<AdminGroupRecord> =
            (await adminListRes.json()) as PaginatedResult<AdminGroupRecord>;
        assert.equal(adminList.items.length, 1);

        const adminGetRes: Response = await app.request(
            `/api/v1/internal/admin/groups/${group.id}`,
            {
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                }
            }
        );
        assert.equal(adminGetRes.status, 200);

        const suspendWithoutReasonRes: Response = await app.request(
            `/api/v1/internal/admin/groups/${group.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: GroupStatus.SUSPENDED })
            }
        );
        assert.equal(suspendWithoutReasonRes.status, 400);

        const suspendRes: Response = await app.request(
            `/api/v1/internal/admin/groups/${group.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({
                    status: GroupStatus.SUSPENDED,
                    reason: "Spam content"
                })
            }
        );
        assert.equal(suspendRes.status, 200);
        const suspendedRecord: AdminGroupRecord = (await suspendRes.json()) as AdminGroupRecord;
        assert.equal(suspendedRecord.status, GroupStatus.SUSPENDED);
        assert.equal(suspendedRecord.moderation_reason, "Spam content");

        const joinWhileSuspendedRes: Response = await app.request(
            `/api/v1/internal/groups/${group.id}/join`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": learnerId,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(joinWhileSuspendedRes.status, 403);

        const restoreRes: Response = await app.request(
            `/api/v1/internal/admin/groups/${group.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: GroupStatus.ACTIVE })
            }
        );
        assert.equal(restoreRes.status, 200);
        const restoredRecord: AdminGroupRecord = (await restoreRes.json()) as AdminGroupRecord;
        assert.equal(restoredRecord.status, GroupStatus.ACTIVE);
        assert.equal(restoredRecord.moderation_reason, null);

        const adminDeleteRes: Response = await app.request(
            `/api/v1/internal/admin/groups/${group.id}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminId,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ reason: "Removed by moderator" })
            }
        );
        assert.equal(adminDeleteRes.status, 204);
        assert.ok(state.groups[0].deletedAt !== null);
        assert.equal(state.groups[0].moderationReason, "Removed by moderator");
    });
});
