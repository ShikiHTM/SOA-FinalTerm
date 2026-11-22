import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { createApp } from "../src/app";
import type { OAuthFetcher } from "../src/auth/oauth.strategies";
import { TokenSchema, type TokenEntity } from "../src/db/entities/token.entity";
import { UserFollowSchema, type UserFollowEntity } from "../src/db/entities/user-follow.entity";
import {
    UserOAuthAccountSchema,
    type UserOAuthAccountEntity
} from "../src/db/entities/user-oauth-account.entity";
import { UserSchema, type UserEntity } from "../src/db/entities/user.entity";
import type { EnvConfig } from "../src/shared/env";
import {
    OAuthProvider,
    UserStatus,
    UserSystemRole,
    type AuthResponse,
    type PaginationMeta
} from "../src/shared/types";
import type { AdminUserRecord, PaginatedAdminUsers } from "../src/users/user.admin";
import type { FollowActionResponse, PaginatedFollowList } from "../src/users/user.follow";
import type {
    InternalUserSummary,
    OwnUserProfile,
    PublicUserProfile
} from "../src/users/user.profile";

interface MockDatabaseState {
    users: UserEntity[];
    oauthAccounts: UserOAuthAccountEntity[];
    tokens: TokenEntity[];
    follows: UserFollowEntity[];
}

class InMemoryUserEntityManager {
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
        if (schema === UserFollowSchema) {
            const follow: UserFollowEntity = {
                follower: data.follower as UserEntity,
                followee: data.followee as UserEntity,
                createdAt: (data.createdAt as Date | undefined) ?? now
            };
            return follow;
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
            } else if (this.isOAuthEntity(entity) && !this.state.oauthAccounts.includes(entity)) {
                this.state.oauthAccounts.push(entity);
            } else if (this.isTokenEntity(entity) && !this.state.tokens.includes(entity)) {
                this.state.tokens.push(entity);
            } else if (this.isFollowEntity(entity) && !this.state.follows.includes(entity)) {
                this.state.follows.push(entity);
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
            this.state.follows = this.state.follows.filter(
                (item: UserFollowEntity): boolean => item !== entity
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
            orderBy?: { createdAt?: string };
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<[unknown[], number]> {
        const matches: unknown[] = await this.find(schema, where);
        const ordered: unknown[] = [...matches];
        if (options.orderBy?.createdAt === "DESC") {
            ordered.sort((left: unknown, right: unknown): number => {
                const leftTime: number = (left as { createdAt: Date }).createdAt.getTime();
                const rightTime: number = (right as { createdAt: Date }).createdAt.getTime();
                return rightTime - leftTime;
            });
        }
        const offset: number = options.offset ?? 0;
        const paged: unknown[] =
            options.limit !== undefined
                ? ordered.slice(offset, offset + options.limit)
                : ordered.slice(offset);
        return [paged, ordered.length];
    }

    public async find(schema: unknown, where: Record<string, unknown>): Promise<unknown[]> {
        if (schema === UserSchema) {
            return this.state.users.filter((user: UserEntity): boolean =>
                this.matchesUserWhere(user, where)
            );
        }
        if (schema === UserOAuthAccountSchema) {
            return this.state.oauthAccounts.filter((account: UserOAuthAccountEntity): boolean => {
                if (typeof where.user === "string" && account.user.id !== where.user) {
                    return false;
                }
                if (where.provider !== undefined && account.provider !== where.provider) {
                    return false;
                }
                if (
                    where.providerAccountId !== undefined &&
                    account.providerAccountId !== where.providerAccountId
                ) {
                    return false;
                }
                return true;
            });
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
        if (schema === UserFollowSchema) {
            return this.state.follows.filter((follow: UserFollowEntity): boolean => {
                if (typeof where.follower === "string" && follow.follower.id !== where.follower) {
                    return false;
                }
                if (typeof where.followee === "string" && follow.followee.id !== where.followee) {
                    return false;
                }
                return true;
            });
        }
        return [];
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

    private matchesUserWhere(user: UserEntity, where: Record<string, unknown>): boolean {
        if (where.deletedAt === null && user.deletedAt !== null) {
            return false;
        }
        if (where.id !== undefined && !this.matchesStringCondition(user.id, where.id)) {
            return false;
        }
        if (where.email !== undefined && !this.matchesStringCondition(user.email, where.email)) {
            return false;
        }
        if (
            where.username !== undefined &&
            !this.matchesStringCondition(user.username, where.username)
        ) {
            return false;
        }
        if (
            where.displayName !== undefined &&
            !this.matchesStringCondition(user.displayName, where.displayName)
        ) {
            return false;
        }
        if (where.status !== undefined && user.status !== where.status) {
            return false;
        }
        if (where.systemRole !== undefined && user.systemRole !== where.systemRole) {
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

    private isFollowEntity(entity: unknown): entity is UserFollowEntity {
        return (
            typeof entity === "object" &&
            entity !== null &&
            "follower" in entity &&
            "followee" in entity
        );
    }
}

function createMockOAuthFetcher(): OAuthFetcher {
    return {
        async postForm<TResponse>(): Promise<TResponse> {
            return { access_token: "google-access-token" } as TResponse;
        },
        async getJson<TResponse>(): Promise<TResponse> {
            return {
                sub: "google-sub-oauth-user",
                email: "oauthuser@example.com",
                name: "OAuth User",
                picture: "https://example.com/oauth.png"
            } as TResponse;
        }
    };
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
    env: EnvConfig;
} {
    const env: EnvConfig = createTestEnv();
    const state: MockDatabaseState = {
        users: [],
        oauthAccounts: [],
        tokens: [],
        follows: []
    };
    const app: ReturnType<typeof createApp> = createApp({
        env,
        forkEntityManager: (): EntityManager =>
            new InMemoryUserEntityManager(state) as unknown as EntityManager,
        oauthFetcher: createMockOAuthFetcher()
    });
    return { app, state, env };
}

async function registerUser(
    app: ReturnType<typeof createApp>,
    env: EnvConfig,
    email: string,
    username: string,
    displayName: string
): Promise<AuthResponse> {
    const response: Response = await app.request("/api/v1/internal/auth/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": env.internalServiceSecret
        },
        body: JSON.stringify({
            email,
            username,
            password: "Password123",
            display_name: displayName
        })
    });
    assert.equal(response.status, 201);
    return (await response.json()) as AuthResponse;
}

describe("user-service users profile, follow, admin, and batch routes", (): void => {
    it("reads and updates own profile with validation and username conflict detection", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const alice: AuthResponse = await registerUser(
            app,
            env,
            "alice@example.com",
            "alice_one",
            "Alice One"
        );
        await registerUser(app, env, "bob@example.com", "bob_two", "Bob Two");

        const meRes: Response = await app.request("/api/v1/internal/users/me", {
            method: "GET",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": alice.user.id,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(meRes.status, 200);
        const meBody: OwnUserProfile = (await meRes.json()) as OwnUserProfile;
        assert.equal(meBody.has_password, true);
        assert.deepEqual(meBody.privacy_settings, {
            show_email: false,
            show_bio: true,
            show_followers: true,
            show_following: true
        });

        const emptyPatchRes: Response = await app.request("/api/v1/internal/users/me", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": alice.user.id,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({})
        });
        assert.equal(emptyPatchRes.status, 400);

        const conflictPatchRes: Response = await app.request("/api/v1/internal/users/me", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": alice.user.id,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({ username: "bob_two" })
        });
        assert.equal(conflictPatchRes.status, 409);

        const updateRes: Response = await app.request("/api/v1/internal/users/me", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": alice.user.id,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                display_name: "Alice Updated",
                bio: "Distributed systems enthusiast",
                avatar_url: "https://example.com/alice.png",
                privacy_settings: {
                    show_email: true,
                    show_followers: false
                }
            })
        });
        assert.equal(updateRes.status, 200);
        const updatedBody: OwnUserProfile = (await updateRes.json()) as OwnUserProfile;
        assert.equal(updatedBody.display_name, "Alice Updated");
        assert.equal(updatedBody.bio, "Distributed systems enthusiast");
        assert.equal(updatedBody.privacy_settings.show_email, true);
        assert.equal(updatedBody.privacy_settings.show_followers, false);
        assert.equal(state.users[0].displayName, "Alice Updated");
    });

    it("changes local password and blocks password change for OAuth-only accounts", async (): Promise<void> => {
        const { app, env } = createTestHarness();
        const alice: AuthResponse = await registerUser(
            app,
            env,
            "alice@example.com",
            "alice_pw",
            "Alice Pw"
        );

        const wrongCurrentRes: Response = await app.request("/api/v1/internal/users/me/password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": alice.user.id,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                current_password: "WrongPassword1",
                new_password: "NewPassword123"
            })
        });
        assert.equal(wrongCurrentRes.status, 400);
        const wrongBody: { error_code: string } = (await wrongCurrentRes.json()) as {
            error_code: string;
        };
        assert.equal(wrongBody.error_code, "INVALID_CURRENT_PASSWORD");

        const samePasswordRes: Response = await app.request("/api/v1/internal/users/me/password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": alice.user.id,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                current_password: "Password123",
                new_password: "Password123"
            })
        });
        assert.equal(samePasswordRes.status, 400);

        const successRes: Response = await app.request("/api/v1/internal/users/me/password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": alice.user.id,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                current_password: "Password123",
                new_password: "NewPassword456"
            })
        });
        assert.equal(successRes.status, 204);

        const loginWithNewRes: Response = await app.request("/api/v1/internal/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                identifier: "alice_pw",
                password: "NewPassword456"
            })
        });
        assert.equal(loginWithNewRes.status, 200);

        const oauthRes: Response = await app.request("/api/v1/internal/auth/oauth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                provider: OAuthProvider.GOOGLE,
                code: "google-code",
                redirect_uri: "http://localhost:3000/auth/google/callback"
            })
        });
        const oauthUser: AuthResponse = (await oauthRes.json()) as AuthResponse;

        const oauthPasswordRes: Response = await app.request("/api/v1/internal/users/me/password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": oauthUser.user.id,
                "X-User-Role": UserSystemRole.USER
            },
            body: JSON.stringify({
                current_password: "Password123",
                new_password: "NewPassword789"
            })
        });
        assert.equal(oauthPasswordRes.status, 400);
        const oauthPasswordBody: { error_code: string } = (await oauthPasswordRes.json()) as {
            error_code: string;
        };
        assert.equal(oauthPasswordBody.error_code, "PASSWORD_NOT_SET");
    });

    it("resolves public profiles by ID and username while enforcing privacy settings and ban restriction", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const alice: AuthResponse = await registerUser(
            app,
            env,
            "alice@example.com",
            "alice_pub",
            "Alice Pub"
        );
        const bob: AuthResponse = await registerUser(
            app,
            env,
            "bob@example.com",
            "bob_pub",
            "Bob Pub"
        );

        state.users[0].bio = "Secret bio";
        state.users[0].privacySettings = {
            show_email: false,
            show_bio: false,
            show_followers: true,
            show_following: false
        };

        const guestProfileRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret
                }
            }
        );
        assert.equal(guestProfileRes.status, 200);
        const guestProfile: PublicUserProfile =
            (await guestProfileRes.json()) as PublicUserProfile;
        assert.equal(guestProfile.email, null);
        assert.equal(guestProfile.bio, null);
        assert.equal(guestProfile.followers_count, 0);
        assert.equal(guestProfile.following_count, null);
        assert.equal(guestProfile.restricted, false);
        assert.equal(guestProfile.is_following, false);

        const byUsernameRes: Response = await app.request(
            `/api/v1/internal/users/username/${alice.user.username}`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bob.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(byUsernameRes.status, 200);
        const byUsernameBody: PublicUserProfile =
            (await byUsernameRes.json()) as PublicUserProfile;
        assert.equal(byUsernameBody.id, alice.user.id);

        state.users[0].status = UserStatus.BANNED;
        const bannedProfileRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret
                }
            }
        );
        assert.equal(bannedProfileRes.status, 200);
        const bannedBody: PublicUserProfile =
            (await bannedProfileRes.json()) as PublicUserProfile;
        assert.equal(bannedBody.restricted, true);
        assert.equal(bannedBody.status, UserStatus.BANNED);
        assert.equal(bannedBody.bio, null);
        assert.equal(bannedBody.followers_count, null);

        const notFoundRes: Response = await app.request(`/api/v1/internal/users/${v4()}`, {
            method: "GET",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret
            }
        });
        assert.equal(notFoundRes.status, 404);
    });

    it("supports follow, unfollow, paginated follow lists, and privacy restrictions", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const alice: AuthResponse = await registerUser(
            app,
            env,
            "alice@example.com",
            "alice_f",
            "Alice Follow"
        );
        const bob: AuthResponse = await registerUser(
            app,
            env,
            "bob@example.com",
            "bob_f",
            "Bob Follow"
        );
        const charlie: AuthResponse = await registerUser(
            app,
            env,
            "charlie@example.com",
            "charlie_f",
            "Charlie Follow"
        );

        const selfFollowRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/follow`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": alice.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(selfFollowRes.status, 400);

        const followRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/follow`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bob.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(followRes.status, 200);
        const followBody: FollowActionResponse =
            (await followRes.json()) as FollowActionResponse;
        assert.deepEqual(followBody, { following: true, followers_count: 1 });

        const idempotentFollowRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/follow`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bob.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(idempotentFollowRes.status, 200);
        assert.equal(state.follows.length, 1);

        await app.request(`/api/v1/internal/users/${alice.user.id}/follow`, {
            method: "POST",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": charlie.user.id,
                "X-User-Role": UserSystemRole.USER
            }
        });

        const profileWithFollowing: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bob.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        const publicProfile: PublicUserProfile =
            (await profileWithFollowing.json()) as PublicUserProfile;
        assert.equal(publicProfile.is_following, true);
        assert.equal(publicProfile.followers_count, 2);

        const followersRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/followers?page=1&limit=1`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret
                }
            }
        );
        assert.equal(followersRes.status, 200);
        const followersPage: PaginatedFollowList =
            (await followersRes.json()) as PaginatedFollowList;
        assert.equal(followersPage.items.length, 1);
        assert.deepEqual(followersPage.pagination, {
            page: 1,
            limit: 1,
            total: 2,
            total_pages: 2
        } satisfies PaginationMeta);

        state.users[0].privacySettings = {
            show_email: false,
            show_bio: true,
            show_followers: false,
            show_following: false
        };
        const hiddenFollowersRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/followers`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bob.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(hiddenFollowersRes.status, 403);

        const ownerFollowingRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/following`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": alice.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(ownerFollowingRes.status, 200);

        const unfollowRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/follow`,
            {
                method: "DELETE",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bob.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(unfollowRes.status, 200);
        const unfollowBody: FollowActionResponse =
            (await unfollowRes.json()) as FollowActionResponse;
        assert.deepEqual(unfollowBody, { following: false, followers_count: 1 });

        state.users[0].status = UserStatus.BANNED;
        const followBannedRes: Response = await app.request(
            `/api/v1/internal/users/${alice.user.id}/follow`,
            {
                method: "POST",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": bob.user.id,
                    "X-User-Role": UserSystemRole.USER
                }
            }
        );
        assert.equal(followBannedRes.status, 403);
    });

    it("enforces admin role, supports filtering/moderation with token revocation, and blocks self-moderation", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const adminAuth: AuthResponse = await registerUser(
            app,
            env,
            "admin@example.com",
            "sys_admin",
            "Platform Admin"
        );
        state.users[0].systemRole = UserSystemRole.ADMIN;

        const targetAuth: AuthResponse = await registerUser(
            app,
            env,
            "target@example.com",
            "target_user",
            "Target Learner"
        );

        const forbiddenListRes: Response = await app.request("/api/v1/internal/admin/users", {
            method: "GET",
            headers: {
                "X-Internal-Secret": env.internalServiceSecret,
                "X-User-Id": targetAuth.user.id,
                "X-User-Role": UserSystemRole.USER
            }
        });
        assert.equal(forbiddenListRes.status, 403);

        const searchRes: Response = await app.request(
            "/api/v1/internal/admin/users?search=target&role=USER&status=ACTIVE",
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                }
            }
        );
        assert.equal(searchRes.status, 200);
        const searchBody: PaginatedAdminUsers = (await searchRes.json()) as PaginatedAdminUsers;
        assert.equal(searchBody.items.length, 1);
        assert.equal(searchBody.items[0].id, targetAuth.user.id);

        const detailRes: Response = await app.request(
            `/api/v1/internal/admin/users/${targetAuth.user.id}`,
            {
                method: "GET",
                headers: {
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                }
            }
        );
        assert.equal(detailRes.status, 200);
        const detailBody: AdminUserRecord = (await detailRes.json()) as AdminUserRecord;
        assert.equal(detailBody.email, "target@example.com");

        const suspendWithoutReasonRes: Response = await app.request(
            `/api/v1/internal/admin/users/${targetAuth.user.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: UserStatus.SUSPENDED })
            }
        );
        assert.equal(suspendWithoutReasonRes.status, 400);

        const suspendRes: Response = await app.request(
            `/api/v1/internal/admin/users/${targetAuth.user.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({
                    status: UserStatus.SUSPENDED,
                    reason: "Policy violation"
                })
            }
        );
        assert.equal(suspendRes.status, 200);
        const suspendedBody: AdminUserRecord = (await suspendRes.json()) as AdminUserRecord;
        assert.equal(suspendedBody.status, UserStatus.SUSPENDED);
        assert.equal(suspendedBody.moderation_reason, "Policy violation");
        assert.equal(suspendedBody.moderated_by, adminAuth.user.id);

        const verifyRevokedRes: Response = await app.request("/api/v1/internal/auth/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({ token: targetAuth.token })
        });
        assert.equal(verifyRevokedRes.status, 401);
        const revokedBody: { error_code: string } = (await verifyRevokedRes.json()) as {
            error_code: string;
        };
        assert.equal(revokedBody.error_code, "TOKEN_REVOKED");

        const reactivateRes: Response = await app.request(
            `/api/v1/internal/admin/users/${targetAuth.user.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ status: UserStatus.ACTIVE })
            }
        );
        assert.equal(reactivateRes.status, 200);
        const reactivatedBody: AdminUserRecord = (await reactivateRes.json()) as AdminUserRecord;
        assert.equal(reactivatedBody.status, UserStatus.ACTIVE);
        assert.equal(reactivatedBody.moderation_reason, null);

        const loginAgainRes: Response = await app.request("/api/v1/internal/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                identifier: "target_user",
                password: "Password123"
            })
        });
        assert.equal(loginAgainRes.status, 200);
        const freshTargetSession: AuthResponse = (await loginAgainRes.json()) as AuthResponse;

        const promoteRes: Response = await app.request(
            `/api/v1/internal/admin/users/${targetAuth.user.id}/role`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ system_role: UserSystemRole.ADMIN })
            }
        );
        assert.equal(promoteRes.status, 200);
        const promotedBody: AdminUserRecord = (await promoteRes.json()) as AdminUserRecord;
        assert.equal(promotedBody.system_role, UserSystemRole.ADMIN);

        const verifyAfterRoleRes: Response = await app.request("/api/v1/internal/auth/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({ token: freshTargetSession.token })
        });
        assert.equal(verifyAfterRoleRes.status, 401);

        const selfBanRes: Response = await app.request(
            `/api/v1/internal/admin/users/${adminAuth.user.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({
                    status: UserStatus.BANNED,
                    reason: "Self ban test"
                })
            }
        );
        assert.equal(selfBanRes.status, 403);

        const selfDemoteRes: Response = await app.request(
            `/api/v1/internal/admin/users/${adminAuth.user.id}/role`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": env.internalServiceSecret,
                    "X-User-Id": adminAuth.user.id,
                    "X-User-Role": UserSystemRole.ADMIN
                },
                body: JSON.stringify({ system_role: UserSystemRole.USER })
            }
        );
        assert.equal(selfDemoteRes.status, 403);
    });

    it("supports internal batch user lookup for sibling services", async (): Promise<void> => {
        const { app, state, env } = createTestHarness();
        const alice: AuthResponse = await registerUser(
            app,
            env,
            "alice@example.com",
            "alice_batch",
            "Alice Batch"
        );
        const deletedUser: AuthResponse = await registerUser(
            app,
            env,
            "deleted@example.com",
            "deleted_batch",
            "Deleted Batch"
        );
        state.users[1].deletedAt = new Date();

        const batchRes: Response = await app.request("/api/v1/internal/users/batch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({
                user_ids: [alice.user.id, alice.user.id, deletedUser.user.id, v4()]
            })
        });
        assert.equal(batchRes.status, 200);
        const batchBody: { users: InternalUserSummary[] } = (await batchRes.json()) as {
            users: InternalUserSummary[];
        };
        assert.equal(batchBody.users.length, 1);
        assert.equal(batchBody.users[0].id, alice.user.id);
        assert.equal(batchBody.users[0].username, "alice_batch");

        const invalidBatchRes: Response = await app.request("/api/v1/internal/users/batch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            body: JSON.stringify({ user_ids: [] })
        });
        assert.equal(invalidBatchRes.status, 400);
    });
});
