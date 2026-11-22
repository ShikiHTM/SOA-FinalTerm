import { createHash } from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";
import bcrypt from "bcryptjs";
import { sign, verify } from "hono/jwt";
import { v4 } from "uuid";
import { TokenSchema, type TokenEntity } from "../db/entities/token.entity";
import type { UserEntity } from "../db/entities/user.entity";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import {
    UserStatus,
    UserSystemRole,
    type AuthResponse,
    type JwtTokenPayload,
    type VerifiedTokenResult
} from "../shared/types";

export const BCRYPT_SALT_ROUNDS: number = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
}

export function hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
}

export async function issueAuthResponse(
    user: UserEntity,
    env: EnvConfig,
    em: EntityManager
): Promise<AuthResponse> {
    if (!env.jwtSecret) {
        throw new Error("JWT_SECRET is not configured.");
    }
    const tokenId: string = v4();
    const issuedAtSeconds: number = Math.floor(Date.now() / 1000);
    const expiresAtSeconds: number = issuedAtSeconds + env.jwtExpiresInSeconds;
    const expiresAt: Date = new Date(expiresAtSeconds * 1000);
    const payload: JwtTokenPayload = {
        sub: user.id,
        user_id: user.id,
        user_role: user.systemRole,
        jti: tokenId,
        iat: issuedAtSeconds,
        exp: expiresAtSeconds
    };
    const token: string = await sign(payload, env.jwtSecret, "HS256");
    const tokenEntity: TokenEntity = em.create(TokenSchema, {
        id: tokenId,
        user,
        tokenHash: hashToken(token),
        expiresAt
    });
    em.persist(tokenEntity);
    await em.flush();
    return {
        token,
        token_type: "Bearer",
        expires_at: expiresAt.toISOString(),
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            display_name: user.displayName,
            avatar_url: user.avatarUrl ?? null,
            system_role: user.systemRole,
            status: user.status
        }
    };
}

export async function verifySessionToken(
    rawToken: string,
    jwtSecret: string,
    em: EntityManager
): Promise<VerifiedTokenResult> {
    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not configured.");
    }
    let decodedPayload: Record<string, unknown>;
    try {
        decodedPayload = await verify(rawToken, jwtSecret, "HS256");
    } catch {
        throw AppError.unauthorized("INVALID_TOKEN", "Session token is invalid or expired.");
    }
    const payloadUserId: unknown = decodedPayload.user_id;
    const payloadUserRole: unknown = decodedPayload.user_role;
    if (
        typeof payloadUserId !== "string" ||
        (payloadUserRole !== UserSystemRole.USER && payloadUserRole !== UserSystemRole.ADMIN)
    ) {
        throw AppError.unauthorized("INVALID_TOKEN", "Session token payload is malformed.");
    }
    const tokenRecord: TokenEntity | null = await em.findOne(
        TokenSchema,
        { tokenHash: hashToken(rawToken) },
        { populate: ["user"] }
    );
    if (tokenRecord === null) {
        throw AppError.unauthorized("TOKEN_REVOKED", "Session token has been revoked.");
    }
    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
        em.remove(tokenRecord);
        await em.flush();
        throw AppError.unauthorized("TOKEN_EXPIRED", "Session token has expired.");
    }
    const user: UserEntity = tokenRecord.user;
    if (user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
        throw AppError.unauthorized("ACCOUNT_INACTIVE", "User account is not active.");
    }
    return {
        valid: true,
        user_id: user.id,
        user_role: user.systemRole,
        status: user.status
    };
}

export async function revokeSessionToken(
    rawToken: string,
    userId: string,
    em: EntityManager
): Promise<void> {
    const tokenRecord: TokenEntity | null = await em.findOne(TokenSchema, {
        tokenHash: hashToken(rawToken)
    });
    if (tokenRecord === null) {
        return;
    }
    if (tokenRecord.user.id !== userId) {
        throw AppError.forbidden(
            "TOKEN_OWNERSHIP_MISMATCH",
            "Session token does not belong to the authenticated user."
        );
    }
    em.remove(tokenRecord);
    await em.flush();
}

export async function revokeAllUserTokens(userId: string, em: EntityManager): Promise<void> {
    const userTokens: TokenEntity[] = await em.find(TokenSchema, { user: userId });
    if (userTokens.length === 0) {
        return;
    }
    for (const tokenRecord of userTokens) {
        em.remove(tokenRecord);
    }
    await em.flush();
}
