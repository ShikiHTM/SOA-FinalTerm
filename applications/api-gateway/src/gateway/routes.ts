import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import {
    UserSystemRole,
    type AppEnv,
    type AuthMode,
    type ServiceKey,
    type VerifiedUser
} from "../shared/types";
import {
    composeAssessment,
    composeAssessmentList,
    composeContest,
    composeContestList,
    composeFavoriteAssessments,
    composeGroup,
    composeGroupBans,
    composeGroupList,
    composeGroupMembers,
    composeGroupRequests,
    composeSubmission,
    composeSubmissionList
} from "./compose";
import {
    forwardRequest,
    verifyBearerToken,
    type ComposeHandler
} from "./proxy";

export type TokenVerifier = (token: string, env: EnvConfig) => Promise<VerifiedUser>;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface GatewayRoute {
    method: HttpMethod;
    path: string;
    service: ServiceKey;
    auth: AuthMode;
    upstreamPath: (c: Context<AppEnv>) => string;
    forwardAuthorization?: boolean;
    compose?: ComposeHandler;
}

function extractBearerToken(rawHeader: string): string {
    const match: RegExpMatchArray | null = rawHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1].trim().length === 0) {
        throw AppError.unauthorized("UNAUTHORIZED", "Invalid Authorization header format.");
    }
    return match[1].trim();
}

function authenticate(
    mode: AuthMode,
    env: EnvConfig,
    verifyToken: TokenVerifier
): MiddlewareHandler<AppEnv> {
    return async (c, next): Promise<void> => {
        if (mode === "public") {
            await next();
            return;
        }
        const rawAuthHeader: string | undefined = c.req.header("Authorization");
        if (!rawAuthHeader) {
            if (mode === "optional") {
                await next();
                return;
            }
            throw AppError.unauthorized("UNAUTHORIZED", "Authorization token is required.");
        }

        const token: string = extractBearerToken(rawAuthHeader);
        const verifiedUser: VerifiedUser = await verifyToken(token, env);
        if (mode === "admin" && verifiedUser.userRole !== UserSystemRole.ADMIN) {
            throw AppError.forbidden("FORBIDDEN", "Administrator role is required.");
        }

        c.set("user", verifiedUser);
        c.set("bearerToken", token);
        await next();
    };
}

function param(c: Context<AppEnv>, name: string): string {
    return encodeURIComponent(c.req.param(name) ?? "");
}

const GATEWAY_ROUTES: GatewayRoute[] = [
    {
        method: "POST",
        path: "/auth/register",
        service: "user",
        auth: "public",
        upstreamPath: (): string => "/api/v1/internal/auth/register"
    },
    {
        method: "POST",
        path: "/auth/login",
        service: "user",
        auth: "public",
        upstreamPath: (): string => "/api/v1/internal/auth/login"
    },
    {
        method: "POST",
        path: "/auth/oauth",
        service: "user",
        auth: "public",
        upstreamPath: (): string => "/api/v1/internal/auth/oauth"
    },
    {
        method: "POST",
        path: "/auth/logout",
        service: "user",
        auth: "required",
        forwardAuthorization: true,
        upstreamPath: (): string => "/api/v1/internal/auth/logout"
    },
    {
        method: "GET",
        path: "/users/me",
        service: "user",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/users/me"
    },
    {
        method: "PATCH",
        path: "/users/me",
        service: "user",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/users/me"
    },
    {
        method: "PUT",
        path: "/users/me/password",
        service: "user",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/users/me/password"
    },
    {
        method: "GET",
        path: "/users/username/:username",
        service: "user",
        auth: "optional",
        upstreamPath: (c): string => `/api/v1/internal/users/username/${param(c, "username")}`
    },
    {
        method: "GET",
        path: "/users/:id",
        service: "user",
        auth: "optional",
        upstreamPath: (c): string => `/api/v1/internal/users/${param(c, "id")}`
    },
    {
        method: "POST",
        path: "/users/:id/follow",
        service: "user",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/users/${param(c, "id")}/follow`
    },
    {
        method: "DELETE",
        path: "/users/:id/follow",
        service: "user",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/users/${param(c, "id")}/follow`
    },
    {
        method: "GET",
        path: "/users/:id/followers",
        service: "user",
        auth: "optional",
        upstreamPath: (c): string => `/api/v1/internal/users/${param(c, "id")}/followers`
    },
    {
        method: "GET",
        path: "/users/:id/following",
        service: "user",
        auth: "optional",
        upstreamPath: (c): string => `/api/v1/internal/users/${param(c, "id")}/following`
    },
    {
        method: "GET",
        path: "/groups",
        service: "group",
        auth: "optional",
        compose: composeGroupList,
        upstreamPath: (): string => "/api/v1/internal/groups"
    },
    {
        method: "POST",
        path: "/groups",
        service: "group",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/groups"
    },
    {
        method: "GET",
        path: "/groups/me",
        service: "group",
        auth: "required",
        compose: composeGroupList,
        upstreamPath: (): string => "/api/v1/internal/groups/me"
    },
    {
        method: "GET",
        path: "/groups/code/:code",
        service: "group",
        auth: "optional",
        compose: composeGroup,
        upstreamPath: (c): string => `/api/v1/internal/groups/code/${param(c, "code")}`
    },
    {
        method: "GET",
        path: "/groups/:id",
        service: "group",
        auth: "optional",
        compose: composeGroup,
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}`
    },
    {
        method: "PATCH",
        path: "/groups/:id",
        service: "group",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}`
    },
    {
        method: "DELETE",
        path: "/groups/:id",
        service: "group",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}`
    },
    {
        method: "POST",
        path: "/groups/:id/transfer-ownership",
        service: "group",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/transfer-ownership`
    },
    {
        method: "POST",
        path: "/groups/:id/join",
        service: "group",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/join`
    },
    {
        method: "POST",
        path: "/groups/:id/leave",
        service: "group",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/leave`
    },
    {
        method: "POST",
        path: "/groups/:id/requests",
        service: "group",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/requests`
    },
    {
        method: "GET",
        path: "/groups/:id/requests",
        service: "group",
        auth: "required",
        compose: composeGroupRequests,
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/requests`
    },
    {
        method: "PATCH",
        path: "/groups/:id/requests/:requestId",
        service: "group",
        auth: "required",
        upstreamPath: (c): string =>
            `/api/v1/internal/groups/${param(c, "id")}/requests/${param(c, "requestId")}`
    },
    {
        method: "GET",
        path: "/groups/:id/members",
        service: "group",
        auth: "optional",
        compose: composeGroupMembers,
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/members`
    },
    {
        method: "PATCH",
        path: "/groups/:id/members/:userId/role",
        service: "group",
        auth: "required",
        upstreamPath: (c): string =>
            `/api/v1/internal/groups/${param(c, "id")}/members/${param(c, "userId")}/role`
    },
    {
        method: "DELETE",
        path: "/groups/:id/members/:userId",
        service: "group",
        auth: "required",
        upstreamPath: (c): string =>
            `/api/v1/internal/groups/${param(c, "id")}/members/${param(c, "userId")}`
    },
    {
        method: "GET",
        path: "/groups/:id/bans",
        service: "group",
        auth: "required",
        compose: composeGroupBans,
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/bans`
    },
    {
        method: "POST",
        path: "/groups/:id/bans",
        service: "group",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/groups/${param(c, "id")}/bans`
    },
    {
        method: "DELETE",
        path: "/groups/:id/bans/:userId",
        service: "group",
        auth: "required",
        upstreamPath: (c): string =>
            `/api/v1/internal/groups/${param(c, "id")}/bans/${param(c, "userId")}`
    },
    {
        method: "GET",
        path: "/assessments",
        service: "assessment",
        auth: "required",
        compose: composeAssessmentList,
        upstreamPath: (): string => "/api/v1/internal/assessments"
    },
    {
        method: "POST",
        path: "/assessments",
        service: "assessment",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/assessments"
    },
    {
        method: "POST",
        path: "/assessments/pdf",
        service: "assessment",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/assessments/pdf"
    },
    {
        method: "GET",
        path: "/assessments/favorites",
        service: "assessment",
        auth: "required",
        compose: composeFavoriteAssessments,
        upstreamPath: (): string => "/api/v1/internal/assessments/favorites"
    },
    {
        method: "GET",
        path: "/assessments/:id",
        service: "assessment",
        auth: "required",
        compose: composeAssessment,
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}`
    },
    {
        method: "PUT",
        path: "/assessments/:id",
        service: "assessment",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}`
    },
    {
        method: "DELETE",
        path: "/assessments/:id",
        service: "assessment",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}`
    },
    {
        method: "GET",
        path: "/assessments/:id/content",
        service: "assessment",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}/content`
    },
    {
        method: "GET",
        path: "/assessments/:id/answer-key",
        service: "assessment",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}/answer-key`
    },
    {
        method: "PUT",
        path: "/assessments/:id/answer-key",
        service: "assessment",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}/answer-key`
    },
    {
        method: "POST",
        path: "/assessments/:id/favorite",
        service: "assessment",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}/favorite`
    },
    {
        method: "DELETE",
        path: "/assessments/:id/favorite",
        service: "assessment",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/assessments/${param(c, "id")}/favorite`
    },
    {
        method: "GET",
        path: "/contests",
        service: "contest",
        auth: "optional",
        compose: composeContestList,
        upstreamPath: (): string => "/api/v1/internal/contests"
    },
    {
        method: "POST",
        path: "/contests",
        service: "contest",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/contests"
    },
    {
        method: "GET",
        path: "/contests/:id",
        service: "contest",
        auth: "optional",
        compose: composeContest,
        upstreamPath: (c): string => `/api/v1/internal/contests/${param(c, "id")}`
    },
    {
        method: "PATCH",
        path: "/contests/:id",
        service: "contest",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/contests/${param(c, "id")}`
    },
    {
        method: "DELETE",
        path: "/contests/:id",
        service: "contest",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/contests/${param(c, "id")}`
    },
    {
        method: "POST",
        path: "/contests/:id/cancel",
        service: "contest",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/contests/${param(c, "id")}/cancel`
    },
    {
        method: "GET",
        path: "/contests/:id/participation",
        service: "contest",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/contests/${param(c, "id")}/participation`
    },
    {
        method: "POST",
        path: "/submissions",
        service: "submission",
        auth: "required",
        upstreamPath: (): string => "/api/v1/internal/submissions"
    },
    {
        method: "GET",
        path: "/submissions/me",
        service: "submission",
        auth: "required",
        compose: composeSubmissionList,
        upstreamPath: (): string => "/api/v1/internal/submissions/me"
    },
    {
        method: "GET",
        path: "/submissions",
        service: "submission",
        auth: "required",
        compose: composeSubmissionList,
        upstreamPath: (): string => "/api/v1/internal/submissions"
    },
    {
        method: "GET",
        path: "/submissions/:id",
        service: "submission",
        auth: "required",
        compose: composeSubmission,
        upstreamPath: (c): string => `/api/v1/internal/submissions/${param(c, "id")}`
    },
    {
        method: "PATCH",
        path: "/submissions/:id/grade",
        service: "submission",
        auth: "required",
        upstreamPath: (c): string => `/api/v1/internal/submissions/${param(c, "id")}/grade`
    },
    {
        method: "GET",
        path: "/notifications",
        service: "notification",
        auth: "required",
        upstreamPath: (): string => "/notifications"
    },
    {
        method: "PATCH",
        path: "/notifications/:notificationId/read",
        service: "notification",
        auth: "required",
        upstreamPath: (c): string => `/notifications/${param(c, "notificationId")}/read`
    },
    {
        method: "GET",
        path: "/admin/users",
        service: "user",
        auth: "admin",
        upstreamPath: (): string => "/api/v1/internal/admin/users"
    },
    {
        method: "GET",
        path: "/admin/users/:id",
        service: "user",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/users/${param(c, "id")}`
    },
    {
        method: "PATCH",
        path: "/admin/users/:id/status",
        service: "user",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/users/${param(c, "id")}/status`
    },
    {
        method: "PATCH",
        path: "/admin/users/:id/role",
        service: "user",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/users/${param(c, "id")}/role`
    },
    {
        method: "GET",
        path: "/admin/groups",
        service: "group",
        auth: "admin",
        compose: composeGroupList,
        upstreamPath: (): string => "/api/v1/internal/admin/groups"
    },
    {
        method: "GET",
        path: "/admin/groups/:id",
        service: "group",
        auth: "admin",
        compose: composeGroup,
        upstreamPath: (c): string => `/api/v1/internal/admin/groups/${param(c, "id")}`
    },
    {
        method: "PATCH",
        path: "/admin/groups/:id/status",
        service: "group",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/groups/${param(c, "id")}/status`
    },
    {
        method: "DELETE",
        path: "/admin/groups/:id",
        service: "group",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/groups/${param(c, "id")}`
    },
    {
        method: "GET",
        path: "/admin/assessments",
        service: "assessment",
        auth: "admin",
        compose: composeAssessmentList,
        upstreamPath: (): string => "/api/v1/internal/admin/assessments"
    },
    {
        method: "GET",
        path: "/admin/assessments/:id",
        service: "assessment",
        auth: "admin",
        compose: composeAssessment,
        upstreamPath: (c): string => `/api/v1/internal/admin/assessments/${param(c, "id")}`
    },
    {
        method: "PATCH",
        path: "/admin/assessments/:id/status",
        service: "assessment",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/assessments/${param(c, "id")}/status`
    },
    {
        method: "DELETE",
        path: "/admin/assessments/:id",
        service: "assessment",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/assessments/${param(c, "id")}`
    },
    {
        method: "GET",
        path: "/admin/contests",
        service: "contest",
        auth: "admin",
        compose: composeContestList,
        upstreamPath: (): string => "/api/v1/internal/admin/contests"
    },
    {
        method: "GET",
        path: "/admin/contests/:id",
        service: "contest",
        auth: "admin",
        compose: composeContest,
        upstreamPath: (c): string => `/api/v1/internal/admin/contests/${param(c, "id")}`
    },
    {
        method: "PATCH",
        path: "/admin/contests/:id/status",
        service: "contest",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/contests/${param(c, "id")}/status`
    },
    {
        method: "DELETE",
        path: "/admin/contests/:id",
        service: "contest",
        auth: "admin",
        upstreamPath: (c): string => `/api/v1/internal/admin/contests/${param(c, "id")}`
    }
];

export function createGatewayRoutes(
    env: EnvConfig,
    verifyToken: TokenVerifier = verifyBearerToken
): Hono<AppEnv> {
    const router: Hono<AppEnv> = new Hono<AppEnv>();

    for (const route of GATEWAY_ROUTES) {
        router.on(
            route.method,
            route.path,
            authenticate(route.auth, env, verifyToken),
            async (c): Promise<Response> => {
                return forwardRequest(c, env, {
                    service: route.service,
                    upstreamPath: route.upstreamPath(c),
                    forwardAuthorization: route.forwardAuthorization,
                    compose: route.compose
                });
            }
        );
    }

    return router;
}
