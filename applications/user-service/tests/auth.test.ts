import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import bcrypt from "bcryptjs";
import { decode } from "hono/jwt";
import { v4 } from "uuid";
import { createApp } from "../src/app";
import type { OAuthFetcher } from "../src/auth/oauth.strategies";
import { TokenSchema, type TokenEntity } from "../src/db/entities/token.entity";
import {
    UserOAuthAccountSchema,
    type UserOAuthAccountEntity
} from "../src/db/entities/user-oauth-account.entity";
import { UserSchema, type UserEntity } from "../src/db/entities/user.entity";
import { closeDB, createMikroOrmConfig, forkEm, getORM } from "../src/db/orm";
import type { EnvConfig } from "../src/shared/env";
import {
    OAuthProvider,
    UserStatus,
    UserSystemRole,
    type AuthResponse,
    type VerifiedTokenResult
} from "../src/shared/types";

interface MockDatabaseState {
    users: UserEntity[];
    oauthAccounts: UserOAuthAccountEntity[];
    tokens: TokenEntity[];
    forkCount: number;
}

class InMemoryEntityManager {
    private readonly state: MockDatabaseState;
    private readonly pendingPersists: unknown[] = [];
    private readonly pendingRemovals: unknown[] = [];

    public constructor(state: MockDatabaseState) {
        this.state = state;
    }

    public create(schema: unknown, data: Record<string, unknown>): unknown {
        const now: Date = new Date();
        if (schema === UserSchema) {
            const user: UserEntity = {
                id: (data.id as string | undefined) ?? v4(),
                email: data.email as string,
                username: data.username as string,
                passwordHash: (data.passwordHash as string | null | undefined) ?? null,
                displayName: data.displayName as string,
                bio: (data.bio as string | null | undefined) ?? null,
                avatarUrl: (data.avatarUrl as string | null | undefined) ?? null,
                privacySettings: (data.privacySettings as Record<string, unknown> | undefined) ?? {},
                systemRole: (data.systemRole as UserSystemRole | undefined) ?? UserSystemRole.USER,
                status: (data.status as UserStatus | undefined) ?? UserStatus.ACTIVE,
                moderationReason: (data.moderationReason as string | null | undefined) ?? null,
                moderatedBy: (data.moderatedBy as string | null | undefined) ?? null,
                moderatedAt: (data.moderatedAt as Date | null | undefined) ?? null,
                deletedAt: (data.deletedAt as Date | null | undefined) ?? null,
                createdAt: (data.createdAt as Date | undefined) ?? now,
                updatedAt: (data.updatedAt as Date | undefined) ?? now
            };
            return user;
        }
        if (schema === UserOAuthAccountSchema) {
            const oauthAccount: UserOAuthAccountEntity = {
                id: (data.id as string | undefined) ?? v4(),
                user: data.user as UserEntity,
                provider: data.provider as OAuthProvider,
                providerAccountId: data.providerAccountId as string,
                providerEmail: (data.providerEmail as string | null | undefined) ?? null,
                linkedAt: (data.linkedAt as Date | undefined) ?? now
            };
            return oauthAccount;
        }
        if (schema === TokenSchema) {
            const token: TokenEntity = {
                id: (data.id as string | undefined) ?? v4(),
                user: data.user as UserEntity,
                tokenHash: data.tokenHash as string,
                expiresAt: data.expiresAt as Date,
                createdAt: (data.createdAt as Date | undefined) ?? now
            };
            return token;
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
            if (this.isUserEntity(entity) && !this.state.users.includes(entity)) {
                this.state.users.push(entity);
            } else if (
                this.isOAuthEntity(entity) &&
                !this.state.oauthAccounts.includes(entity)
            ) {
                this.state.oauthAccounts.push(entity);
            } else if (this.isTokenEntity(entity) && !this.state.tokens.includes(entity)) {
                this.state.tokens.push(entity);
            }
        }
        for (const entity of this.pendingRemovals) {
            this.state.users = this.state.users.filter((item: UserEntity): boolean => item !== entity);
            this.state.oauthAccounts = this.state.oauthAccounts.filter(
                (item: UserOAuthAccountEntity): boolean => item !== entity
            );
            this.state.tokens = this.state.tokens.filter(
                (item: TokenEntity): boolean => item !== entity
            );
        }
        this.pendingPersists.length = 0;
        this.pendingRemovals.length = 0;
    }

    public async findOne(schema: unknown, where: Record<string, unknown>): Promise<unknown> {
        const matches: unknown[] = await this.find(schema, where);
        return matches[0] ?? null;
    }

    public async find(schema: unknown, where: Record<string, unknown>): Promise<unknown[]> {
        if (schema === UserSchema) {
            return this.state.users.filter((user: UserEntity): boolean =>
                this.matchesUserWhere(user, where)
            );
        }
        if (schema === UserOAuthAccountSchema) {
            return this.state.oauthAccounts.filter(
                (account: UserOAuthAccountEntity): boolean =>
                    account.provider === where.provider &&
                    account.providerAccountId === where.providerAccountId
            );
        }
        if (schema === TokenSchema) {
            return this.state.tokens.filter((token: TokenEntity): boolean => {
                if (typeof where.tokenHash === "string" && token.tokenHash !== where.tokenHash) {
                    return false;
                }
                if (typeof where.user === "string" && token.user.id !== where.user) {
                    return false;
                }
                return true;
            });
        }
        return [];
    }

    private matchesUserWhere(user: UserEntity, where: Record<string, unknown>): boolean {
        if (where.deletedAt === null && user.deletedAt !== null) {
            return false;
        }
        if (typeof where.email === "string" && user.email !== where.email) {
            return false;
        }
        if (typeof where.username === "string" && user.username !== where.username) {
            return false;
        }
        if (Array.isArray(where.$or)) {
            const orList: Record<string, unknown>[] = where.$or as Record<string, unknown>[];
            const anyMatch: boolean = orList.some((clause: Record<string, unknown>): boolean =>
                this.matchesUserWhere(user, clause)
            );
            if (!anyMatch) {
                return false;
            }
        }
        return true;
    }

    private isUserEntity(entity: unknown): entity is UserEntity {
        return typeof entity === "object" && entity !== null && "username" in entity;
    }

    private isOAuthEntity(entity: unknown): entity is UserOAuthAccountEntity {
        return typeof entity === "object" && entity !== null && "providerAccountId" in entity;
    }

    private isTokenEntity(entity: unknown): entity is TokenEntity {
        return typeof entity === "object" && entity !== null && "tokenHash" in entity;
    }
}

interface MockOAuthState extends OAuthFetcher {
    shouldFail: boolean;
    githubReturnsNullProfileEmail: boolean;
}

function createMockOAuthFetcher(): MockOAuthState {
    const mockState: MockOAuthState = {
        shouldFail: false,
        githubReturnsNullProfileEmail: false,
        async postForm<TResponse>(url: string): Promise<TResponse> {
            if (mockState.shouldFail) {
                throw new Error("OAuth network error");
            }
            if (url.includes("googleapis.com")) {
                return { access_token: "google-access-token" } as TResponse;
            }
            return { access_token: "github-access-token" } as TResponse;
        },
        async getJson<TResponse>(url: string): Promise<TResponse> {
            if (mockState.shouldFail) {
                throw new Error("OAuth profile error");
            }
            if (url.includes("googleapis.com")) {
                return {
                    sub: "google-sub-123",
                    email: "GoogleUser@example.com",
                    name: "Google Learner",
                    picture: "https://example.com/google-avatar.png"
                } as TResponse;
            }
            if (url.endsWith("/user/emails")) {
                return [
                    {
                        email: "GoogleUser@example.com",
                        primary: true,
                        verified: true
                    }
                ] as TResponse;
            }
            return {
                id: 98765,
                login: "ghlearner",
                name: "GitHub Learner",
                email: mockState.githubReturnsNullProfileEmail ? null : "GoogleUser@example.com",
                avatar_url: "https://example.com/gh-avatar.png"
            } as TResponse;
        }
    };
    return mockState;
}

function createTestEnv(): EnvConfig {
    return {
        port: 3031,
        dbHost: "localhost",
        dbPort: 5432,
        dbUser: "user_service",
        dbPassword: "user_service_dev",
        dbName: "user_db",
        dbSyncSchema: false,
        internalServiceSecret: "test-internal-secret",
        jwtSecret: "test-jwt-secret-key-32-chars-min",
        jwtExpiresInSeconds: 3600,
        googleClientId: "google-client-id",
        googleClientSecret: "google-client-secret",
        githubClientId: "github-client-id",
        githubClientSecret: "github-client-secret",
        corsAllowedOrigins: ["http://localhost:8080", "http://127.0.0.1:8080"]
    };
}

function createTestHarness(): {
    app: ReturnType<typeof createApp>;
    state: MockDatabaseState;
    oauthFetcher: MockOAuthState;
    env: EnvConfig;
} {
    const env: EnvConfig = createTestEnv();
    const state: MockDatabaseState = {
        users: [],
        oauthAccounts: [],
        tokens: [],
        forkCount: 0
    };
    const oauthFetcher: MockOAuthState = createMockOAuthFetcher();
    const forkEntityManager: () => EntityManager = (): EntityManager => {
        state.forkCount += 1;
        return new InMemoryEntityManager(state) as unknown as EntityManager;
    };
    const app: ReturnType<typeof createApp> = createApp({
        env,
        forkEntityManager,
        oauthFetcher
    });
    return { app, state, oauthFetcher, env };
}

describe("user-service ORM, strategy pattern, JWT, and auth routes", (): void => {
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
            assert.match(ddl, /create type "user_system_role" as enum \('USER', 'ADMIN'\)/i);
            assert.match(ddl, /create type "user_status" as enum \('ACTIVE', 'SUSPENDED', 'BANNED'\)/i);
            assert.match(ddl, /create type "oauth_provider" as enum \('GOOGLE', 'GITHUB'\)/i);
            assert.match(ddl, /create table "users"/i);
            assert.match(ddl, /create table "user_oauth_accounts"/i);
            assert.match(ddl, /create table "tokens"/i);
            assert.match(ddl, /create table "user_follows"/i);
            assert.match(ddl, /chk_user_follows_no_self/i);
            assert.match(ddl, /follower_id <> followee_id/i);
            assert.match(ddl, /uq_oauth_provider_account/i);
            assert.match(ddl, /on delete cascade/i);
            assert.match(ddl, /idx_tokens_expires_at/i);
        } finally {
            await orm.close(true);
        }
    });

    it("enforces X-Internal-Secret and forks EntityManager per internal request", async (): Promise<void> => {
        const { app, state } = createTestHarness();

        const missingSecretRes: Response = await app.request("/api/v1/internal/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                identifier: "alice",
                password: "Password123"
            })
        });
        assert.equal(missingSecretRes.status, 401);
        const missingBody: { error_code: string } = (await missingSecretRes.json()) as {
            error_code: string;
        };
        assert.equal(missingBody.error_code, "MISSING_INTERNAL_SECRET");

        const wrongSecretRes: Response = await app.request("/api/v1/internal/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": "wrong-secret"
            },
            body: JSON.stringify({
                identifier: "alice",
                password: "Password123"
            })
        });
        assert.equal(wrongSecretRes.status, 403);
        const wrongBody: { error_code: string } = (await wrongSecretRes.json()) as {
            error_code: string;
        };
        assert.equal(wrongBody.error_code, "INVALID_INTERNAL_SECRET");
        assert.equal(state.forkCount, 0);
    });

    it("validates request payloads with @hono/zod-validator", async (): Promise<void> => {
        const { app, env } = createTestHarness();

        const invalidRegisterRes: Response = await app.request("/api/v1/internal/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                email: "not-an-email",
                username: "ab",
                password: "weak",
                display_name: ""
            })
        });
        assert.equal(invalidRegisterRes.status, 400);
        const body: { error_code: string; details?: string[] } =
            (await invalidRegisterRes.json()) as { error_code: string; details?: string[] };
        assert.equal(body.error_code, "VALIDATION_ERROR");
        assert.ok(Array.isArray(body.details) && body.details.length >= 3);
    });

    it("supports credentials register (bcrypt salt 12, JWT payload), login, verify, and immediate revocation on logout", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();

        const registerRes: Response = await app.request("/api/v1/internal/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                email: "Alice@Example.com",
                username: "alice_soa",
                password: "Password123",
                display_name: "Alice SOA"
            })
        });
        assert.equal(registerRes.status, 201);
        const registerBody: AuthResponse = (await registerRes.json()) as AuthResponse;
        assert.equal(registerBody.token_type, "Bearer");
        assert.equal(registerBody.user.email, "alice@example.com");
        assert.equal(registerBody.user.system_role, UserSystemRole.USER);
        assert.equal(state.users.length, 1);
        assert.equal(state.tokens.length, 1);

        const storedHash: string | null = state.users[0].passwordHash;
        assert.ok(storedHash !== null);
        assert.match(storedHash, /^\$2[aby]\$12\$/);
        assert.equal(await bcrypt.compare("Password123", storedHash), true);

        const expectedTokenHash: string = createHash("sha256")
            .update(registerBody.token)
            .digest("hex");
        assert.equal(state.tokens[0].tokenHash, expectedTokenHash);

        const decoded: { payload: Record<string, unknown> } = decode(registerBody.token);
        assert.equal(decoded.payload.user_id, registerBody.user.id);
        assert.equal(decoded.payload.user_role, UserSystemRole.USER);

        const duplicateRes: Response = await app.request("/api/v1/internal/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                email: "alice@example.com",
                username: "another_user",
                password: "Password123",
                display_name: "Duplicate"
            })
        });
        assert.equal(duplicateRes.status, 409);

        const loginRes: Response = await app.request("/api/v1/internal/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                identifier: "alice_soa",
                password: "Password123"
            })
        });
        assert.equal(loginRes.status, 200);
        const loginBody: AuthResponse = (await loginRes.json()) as AuthResponse;
        assert.equal(state.tokens.length, 2);

        const wrongPasswordRes: Response = await app.request("/api/v1/internal/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                identifier: "alice@example.com",
                password: "WrongPassword1"
            })
        });
        assert.equal(wrongPasswordRes.status, 401);

        const verifyRes: Response = await app.request("/api/v1/internal/auth/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({ token: loginBody.token })
        });
        assert.equal(verifyRes.status, 200);
        const verifyBody: VerifiedTokenResult = (await verifyRes.json()) as VerifiedTokenResult;
        assert.equal(verifyBody.valid, true);
        assert.equal(verifyBody.user_id, loginBody.user.id);
        assert.equal(verifyBody.user_role, UserSystemRole.USER);

        const missingHeadersLogout: Response = await app.request("/api/v1/internal/auth/logout", {
            method: "POST",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                Authorization: `Bearer ${loginBody.token}`
            }
        });
        assert.equal(missingHeadersLogout.status, 401);

        const logoutRes: Response = await app.request("/api/v1/internal/auth/logout", {
            method: "POST",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": loginBody.user.id,
                "X-User-Role": UserSystemRole.USER,
                Authorization: `Bearer ${loginBody.token}`
            }
        });
        assert.equal(logoutRes.status, 204);
        assert.equal(state.tokens.length, 1);

        const verifyAfterRevokeRes: Response = await app.request("/api/v1/internal/auth/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({ token: loginBody.token })
        });
        assert.equal(verifyAfterRevokeRes.status, 401);
        const revokedBody: { error_code: string } = (await verifyAfterRevokeRes.json()) as {
            error_code: string;
        };
        assert.equal(revokedBody.error_code, "TOKEN_REVOKED");
        assert.equal(state.forkCount, 8);
    });

    it("blocks suspended or banned users on login", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();

        await app.request("/api/v1/internal/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                email: "locked@example.com",
                username: "locked_user",
                password: "Password123",
                display_name: "Locked User"
            })
        });
        state.users[0].status = UserStatus.BANNED;

        const loginRes: Response = await app.request("/api/v1/internal/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                identifier: "locked_user",
                password: "Password123"
            })
        });
        assert.equal(loginRes.status, 403);
        const body: { error_code: string } = (await loginRes.json()) as { error_code: string };
        assert.equal(body.error_code, "ACCOUNT_LOCKED");
    });

    it("supports Google and GitHub OAuth2 strategies with account linking and rejects non-OAuth providers", async (): Promise<void> => {
        const { app, state, oauthFetcher, env } = createTestHarness();

        const googleRes: Response = await app.request("/api/v1/internal/auth/oauth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                provider: OAuthProvider.GOOGLE,
                code: "google-auth-code",
                redirect_uri: "http://localhost:3000/auth/google/callback"
            })
        });
        assert.equal(googleRes.status, 200);
        const googleBody: AuthResponse = (await googleRes.json()) as AuthResponse;
        assert.equal(googleBody.user.email, "googleuser@example.com");
        assert.equal(state.users.length, 1);
        assert.equal(state.oauthAccounts.length, 1);
        assert.equal(state.oauthAccounts[0].provider, OAuthProvider.GOOGLE);

        oauthFetcher.githubReturnsNullProfileEmail = true;
        const githubRes: Response = await app.request("/api/v1/internal/auth/oauth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                provider: OAuthProvider.GITHUB,
                code: "github-auth-code",
                redirect_uri: "http://localhost:3000/auth/github/callback"
            })
        });
        assert.equal(githubRes.status, 200);
        const githubBody: AuthResponse = (await githubRes.json()) as AuthResponse;
        assert.equal(githubBody.user.id, googleBody.user.id);
        assert.equal(state.users.length, 1);
        assert.equal(state.oauthAccounts.length, 2);

        const invalidProviderRes: Response = await app.request("/api/v1/internal/auth/oauth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                provider: "CREDENTIALS",
                code: "some-code",
                redirect_uri: "http://localhost:3000/auth/callback"
            })
        });
        assert.equal(invalidProviderRes.status, 400);
        const invalidProviderBody: { error_code: string } =
            (await invalidProviderRes.json()) as { error_code: string };
        assert.equal(invalidProviderBody.error_code, "VALIDATION_ERROR");

        oauthFetcher.shouldFail = true;
        const failRes: Response = await app.request("/api/v1/internal/auth/oauth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                provider: OAuthProvider.GOOGLE,
                code: "bad-code",
                redirect_uri: "http://localhost:3000/auth/google/callback"
            })
        });
        assert.equal(failRes.status, 502);
        const failBody: { error_code: string } = (await failRes.json()) as { error_code: string };
        assert.equal(failBody.error_code, "OAUTH_PROVIDER_ERROR");
    });

    it("exposes /health endpoint", async (): Promise<void> => {
        const { app } = createTestHarness();

        const healthRes: Response = await app.request("/health");
        assert.equal(healthRes.status, 200);
        const healthBody: { status: string; service: string } = (await healthRes.json()) as {
            status: string;
            service: string;
        };
        assert.deepEqual(healthBody, { status: "ok", service: "user-service" });
    });

    it("handles CORS preflight and attaches Access-Control-Allow-Origin for allowed origins", async (): Promise<void> => {
        const { app, state } = createTestHarness();

        const preflightRes: Response = await app.request("/api/v1/internal/auth/register", {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:8080",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type, X-Internal-Secret"
            }
        });
        assert.equal(preflightRes.status, 204);
        assert.equal(
            preflightRes.headers.get("Access-Control-Allow-Origin"),
            "http://localhost:8080"
        );
        assert.match(
            preflightRes.headers.get("Access-Control-Allow-Headers") ?? "",
            /X-Internal-Secret/
        );
        assert.equal(state.forkCount, 0);

        const missingSecretCorsRes: Response = await app.request("/api/v1/internal/auth/register", {
            method: "POST",
            headers: {
                Origin: "http://localhost:8080",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        });
        assert.equal(missingSecretCorsRes.status, 401);
        assert.equal(
            missingSecretCorsRes.headers.get("Access-Control-Allow-Origin"),
            "http://localhost:8080"
        );

        const disallowedOriginRes: Response = await app.request("/health", {
            method: "GET",
            headers: {
                Origin: "https://evil.example"
            }
        });
        assert.equal(disallowedOriginRes.status, 200);
        assert.equal(disallowedOriginRes.headers.get("Access-Control-Allow-Origin"), null);
    });
});
