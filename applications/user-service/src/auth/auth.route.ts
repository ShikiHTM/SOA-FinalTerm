import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import type { UserEntity } from "../db/entities/user.entity";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import { createZodValidator, requireAuthenticatedHeaders } from "../shared/middleware";
import type { AppEnv, AuthResponse, OAuthProvider } from "../shared/types";
import { issueAuthResponse, revokeSessionToken } from "./auth.token";
import { loginWithCredentials, registerWithCredentials } from "./credentials.auth";
import { authenticateWithOAuth, type OAuthStrategy } from "./oauth.strategies";
import {
    LoginRequestSchema,
    OAuthLoginRequestSchema,
    RegisterRequestSchema,
    type LoginRequestDto,
    type OAuthLoginRequestDto,
    type RegisterRequestDto
} from "./schemas/auth.schema";

function extractBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
        throw AppError.unauthorized(
            "MISSING_BEARER_TOKEN",
            "Authorization Bearer token is required."
        );
    }
    const prefix: string = "Bearer ";
    if (!authorizationHeader.startsWith(prefix)) {
        throw AppError.unauthorized(
            "INVALID_AUTHORIZATION_HEADER",
            "Authorization header must use Bearer scheme."
        );
    }
    const token: string = authorizationHeader.slice(prefix.length).trim();
    if (token.length === 0) {
        throw AppError.unauthorized(
            "MISSING_BEARER_TOKEN",
            "Authorization Bearer token is required."
        );
    }
    return token;
}

export function createAuthRoute(
    env: EnvConfig,
    oauthStrategies: Record<OAuthProvider, OAuthStrategy>
): Hono<AppEnv> {
    const router: Hono<AppEnv> = new Hono<AppEnv>();

    router.post(
        "/login",
        createZodValidator("json", LoginRequestSchema),
        async (c): Promise<Response> => {
            const payload: LoginRequestDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const user: UserEntity = await loginWithCredentials(payload, em);
            const result: AuthResponse = await issueAuthResponse(user, env, em);
            return c.json(result, 200);
        }
    );

    router.post(
        "/register",
        createZodValidator("json", RegisterRequestSchema),
        async (c): Promise<Response> => {
            const payload: RegisterRequestDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const user: UserEntity = await registerWithCredentials(payload, em);
            const result: AuthResponse = await issueAuthResponse(user, env, em);
            return c.json(result, 201);
        }
    );

    router.post(
        "/oauth",
        createZodValidator("json", OAuthLoginRequestSchema),
        async (c): Promise<Response> => {
            const payload: OAuthLoginRequestDto = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const user: UserEntity = await authenticateWithOAuth(payload, oauthStrategies, em);
            const result: AuthResponse = await issueAuthResponse(user, env, em);
            return c.json(result, 200);
        }
    );

    router.post(
        "/logout",
        requireAuthenticatedHeaders,
        async (c): Promise<Response> => {
            const userId: string | undefined = c.get("userId");
            if (!userId) {
                throw AppError.unauthorized("UNAUTHORIZED", "Authenticated user ID is missing.");
            }
            const rawToken: string = extractBearerToken(c.req.header("Authorization"));
            const em: EntityManager = c.get("em");
            await revokeSessionToken(rawToken, userId, em);
            return c.body(null, 204);
        }
    );

    return router;
}
