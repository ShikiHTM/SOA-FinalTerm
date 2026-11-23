import { randomBytes } from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";
import got from "got";
import { v4 } from "uuid";
import {
    UserOAuthAccountSchema,
    type UserOAuthAccountEntity
} from "../db/entities/user-oauth-account.entity";
import { UserSchema, type UserEntity } from "../db/entities/user.entity";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import { lmsUserRegistrationsTotal } from "../shared/metrics";
import { OAuthProvider, UserStatus, UserSystemRole } from "../shared/types";
import type { OAuthLoginRequestDto } from "./schemas/auth.schema";

export interface OAuthProfile {
    providerAccountId: string;
    email: string;
    displayName: string;
    usernameHint: string;
    avatarUrl: string | null;
}

export interface OAuthFetcher {
    postForm<TResponse>(url: string, form: Record<string, string>): Promise<TResponse>;
    getJson<TResponse>(url: string, headers: Record<string, string>): Promise<TResponse>;
}

export type OAuthStrategy = (payload: OAuthLoginRequestDto) => Promise<OAuthProfile>;

interface OAuthTokenResponse {
    access_token?: string;
}

interface GoogleUserInfoResponse {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
}

interface GitHubUserResponse {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
}

interface GitHubEmailItem {
    email: string;
    primary: boolean;
    verified: boolean;
}

const GOOGLE_TOKEN_URL: string = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: string = "https://www.googleapis.com/oauth2/v3/userinfo";
const GITHUB_TOKEN_URL: string = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL: string = "https://api.github.com/user";
const GITHUB_EMAILS_URL: string = "https://api.github.com/user/emails";

export const DEFAULT_OAUTH_FETCHER: OAuthFetcher = {
    async postForm<TResponse>(url: string, form: Record<string, string>): Promise<TResponse> {
        return got
            .post(url, {
                form,
                headers: { Accept: "application/json" }
            })
            .json<TResponse>();
    },

    async getJson<TResponse>(url: string, headers: Record<string, string>): Promise<TResponse> {
        return got
            .get(url, {
                headers: {
                    Accept: "application/json",
                    ...headers
                }
            })
            .json<TResponse>();
    }
};

function assertActiveUser(user: UserEntity): void {
    if (user.deletedAt !== null) {
        throw AppError.forbidden("ACCOUNT_DELETED", "User account has been removed.");
    }
    if (user.status !== UserStatus.ACTIVE) {
        throw AppError.forbidden("ACCOUNT_LOCKED", "Account is suspended or banned.");
    }
}

async function generateUniqueUsername(hint: string, em: EntityManager): Promise<string> {
    const sanitizedBase: string = hint
        .trim()
        .replace(/[^a-zA-Z0-9_.-]/g, "_")
        .slice(0, 48);
    const baseUsername: string = sanitizedBase.length >= 3 ? sanitizedBase : `user_${sanitizedBase}`;
    const normalizedBase: string = baseUsername.length >= 3 ? baseUsername : "lms_user";
    const firstCheck: UserEntity | null = await em.findOne(UserSchema, {
        username: normalizedBase
    });
    if (firstCheck === null) {
        return normalizedBase;
    }
    for (let attempt: number = 0; attempt < 5; attempt += 1) {
        const suffix: string = randomBytes(3).toString("hex");
        const candidate: string = `${normalizedBase.slice(0, 57)}_${suffix}`;
        const existing: UserEntity | null = await em.findOne(UserSchema, {
            username: candidate
        });
        if (existing === null) {
            return candidate;
        }
    }
    return `user_${v4().slice(0, 12)}`;
}

async function resolveOAuthUser(
    oauthProvider: OAuthProvider,
    profile: OAuthProfile,
    em: EntityManager
): Promise<UserEntity> {
    const normalizedEmail: string = profile.email.trim().toLowerCase();
    const existingLink: UserOAuthAccountEntity | null = await em.findOne(
        UserOAuthAccountSchema,
        {
            provider: oauthProvider,
            providerAccountId: profile.providerAccountId
        },
        { populate: ["user"] }
    );
    if (existingLink !== null) {
        const linkedUser: UserEntity = existingLink.user;
        assertActiveUser(linkedUser);
        return linkedUser;
    }
    const existingUser: UserEntity | null = await em.findOne(UserSchema, {
        email: normalizedEmail
    });
    if (existingUser !== null) {
        assertActiveUser(existingUser);
        const newLink: UserOAuthAccountEntity = em.create(UserOAuthAccountSchema, {
            id: v4(),
            user: existingUser,
            provider: oauthProvider,
            providerAccountId: profile.providerAccountId,
            providerEmail: normalizedEmail
        });
        em.persist(newLink);
        await em.flush();
        return existingUser;
    }
    const username: string = await generateUniqueUsername(profile.usernameHint, em);
    const createdUser: UserEntity = em.create(UserSchema, {
        id: v4(),
        email: normalizedEmail,
        username,
        passwordHash: null,
        displayName: profile.displayName.trim() || username,
        avatarUrl: profile.avatarUrl,
        privacySettings: {},
        systemRole: UserSystemRole.USER,
        status: UserStatus.ACTIVE
    });
    const oauthLink: UserOAuthAccountEntity = em.create(UserOAuthAccountSchema, {
        id: v4(),
        user: createdUser,
        provider: oauthProvider,
        providerAccountId: profile.providerAccountId,
        providerEmail: normalizedEmail
    });
    em.persist(createdUser);
    em.persist(oauthLink);
    await em.flush();
    lmsUserRegistrationsTotal.inc({ method: oauthProvider.toLowerCase() });
    return createdUser;
}

async function fetchGoogleProfile(
    payload: OAuthLoginRequestDto,
    env: EnvConfig,
    fetcher: OAuthFetcher
): Promise<OAuthProfile> {
    if (!env.googleClientId || !env.googleClientSecret) {
        throw AppError.badGateway("OAUTH_NOT_CONFIGURED", "Google OAuth2 is not configured.");
    }
    let tokenResponse: OAuthTokenResponse;
    try {
        tokenResponse = await fetcher.postForm<OAuthTokenResponse>(GOOGLE_TOKEN_URL, {
            code: payload.code,
            client_id: env.googleClientId,
            client_secret: env.googleClientSecret,
            redirect_uri: payload.redirect_uri,
            grant_type: "authorization_code"
        });
    } catch {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "Failed to exchange Google OAuth2 code.");
    }
    if (!tokenResponse.access_token) {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "Google OAuth2 did not return an access token.");
    }
    let userInfo: GoogleUserInfoResponse;
    try {
        userInfo = await fetcher.getJson<GoogleUserInfoResponse>(GOOGLE_USERINFO_URL, {
            Authorization: `Bearer ${tokenResponse.access_token}`
        });
    } catch {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "Failed to fetch Google user profile.");
    }
    if (!userInfo.sub || !userInfo.email) {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "Google profile did not include required fields.");
    }
    const emailPrefix: string = userInfo.email.split("@")[0] ?? "google_user";
    return {
        providerAccountId: userInfo.sub,
        email: userInfo.email,
        displayName: userInfo.name ?? emailPrefix,
        usernameHint: emailPrefix,
        avatarUrl: userInfo.picture ?? null
    };
}

async function resolveGitHubEmail(
    profileEmail: string | null,
    headers: Record<string, string>,
    fetcher: OAuthFetcher
): Promise<string> {
    if (profileEmail && profileEmail.trim().length > 0) {
        return profileEmail;
    }
    let emails: GitHubEmailItem[];
    try {
        emails = await fetcher.getJson<GitHubEmailItem[]>(GITHUB_EMAILS_URL, headers);
    } catch {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "Failed to fetch GitHub user emails.");
    }
    const resolved: GitHubEmailItem | undefined =
        emails.find((item: GitHubEmailItem): boolean => item.primary && item.verified) ??
        emails.find((item: GitHubEmailItem): boolean => item.verified);
    if (!resolved) {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "GitHub account has no verified email address.");
    }
    return resolved.email;
}

async function fetchGitHubProfile(
    payload: OAuthLoginRequestDto,
    env: EnvConfig,
    fetcher: OAuthFetcher
): Promise<OAuthProfile> {
    if (!env.githubClientId || !env.githubClientSecret) {
        throw AppError.badGateway("OAUTH_NOT_CONFIGURED", "GitHub OAuth2 is not configured.");
    }
    let tokenResponse: OAuthTokenResponse;
    try {
        tokenResponse = await fetcher.postForm<OAuthTokenResponse>(GITHUB_TOKEN_URL, {
            code: payload.code,
            client_id: env.githubClientId,
            client_secret: env.githubClientSecret,
            redirect_uri: payload.redirect_uri
        });
    } catch {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "Failed to exchange GitHub OAuth2 code.");
    }
    if (!tokenResponse.access_token) {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "GitHub OAuth2 did not return an access token.");
    }
    const headers: Record<string, string> = {
        Authorization: `Bearer ${tokenResponse.access_token}`,
        "User-Agent": "lms-user-service"
    };
    let githubUser: GitHubUserResponse;
    try {
        githubUser = await fetcher.getJson<GitHubUserResponse>(GITHUB_USER_URL, headers);
    } catch {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "Failed to fetch GitHub user profile.");
    }
    if (typeof githubUser.id !== "number" || !githubUser.login) {
        throw AppError.badGateway("OAUTH_PROVIDER_ERROR", "GitHub profile did not include required fields.");
    }
    const email: string = await resolveGitHubEmail(githubUser.email ?? null, headers, fetcher);
    return {
        providerAccountId: String(githubUser.id),
        email,
        displayName: githubUser.name ?? githubUser.login,
        usernameHint: githubUser.login,
        avatarUrl: githubUser.avatar_url ?? null
    };
}

export function createOAuthStrategies(
    env: EnvConfig,
    fetcher: OAuthFetcher = DEFAULT_OAUTH_FETCHER
): Record<OAuthProvider, OAuthStrategy> {
    return {
        [OAuthProvider.GOOGLE]: (payload: OAuthLoginRequestDto): Promise<OAuthProfile> =>
            fetchGoogleProfile(payload, env, fetcher),
        [OAuthProvider.GITHUB]: (payload: OAuthLoginRequestDto): Promise<OAuthProfile> =>
            fetchGitHubProfile(payload, env, fetcher)
    };
}

export async function authenticateWithOAuth(
    payload: OAuthLoginRequestDto,
    strategies: Record<OAuthProvider, OAuthStrategy>,
    em: EntityManager
): Promise<UserEntity> {
    const strategy: OAuthStrategy = strategies[payload.provider];
    const profile: OAuthProfile = await strategy(payload);
    return resolveOAuthUser(payload.provider, profile, em);
}
