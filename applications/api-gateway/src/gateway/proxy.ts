import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import got, { type Method, type Response as GotResponse } from "got";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import {
    gatewayAuthVerificationsTotal,
    gatewayUpstreamDurationSeconds,
    gatewayUpstreamRequestsTotal,
    toStatusClass
} from "../shared/metrics";
import { UserSystemRole, type AppEnv, type ServiceKey, type UserSummary, type VerifiedUser } from "../shared/types";

export interface ComposeContext {
    env: EnvConfig;
    user?: VerifiedUser;
}

export type ComposeHandler = (payload: unknown, ctx: ComposeContext) => Promise<unknown>;

export interface ForwardOptions {
    service: ServiceKey;
    upstreamPath: string;
    forwardAuthorization?: boolean;
    compose?: ComposeHandler;
}

const UPSTREAM_TIMEOUT_MS: number = 15000;
const INTERNAL_TIMEOUT_MS: number = 5000;
const USER_BATCH_LIMIT: number = 100;

function parseJsonSafe(rawText: string): unknown | null {
    if (rawText.trim().length === 0) {
        return null;
    }
    try {
        return JSON.parse(rawText) as unknown;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildUpstreamHeaders(
    env: EnvConfig,
    service: ServiceKey,
    user?: VerifiedUser,
    extraHeaders: Record<string, string> = {}
): Record<string, string> {
    const headers: Record<string, string> = {
        ...extraHeaders
    };
    if (service !== "notification" && env.internalServiceSecret.length > 0) {
        headers["X-Internal-Secret"] = env.internalServiceSecret;
    }
    if (user !== undefined) {
        headers["X-User-Id"] = user.userId;
        headers["X-User-Role"] = user.userRole;
    }
    return headers;
}

export async function verifyBearerToken(token: string, env: EnvConfig): Promise<VerifiedUser> {
    const verifyUrl: string = `${env.services.user}/api/v1/internal/auth/verify`;
    let response: GotResponse<string>;
    try {
        response = await got.post(verifyUrl, {
            headers: {
                Accept: "application/json",
                "X-Internal-Secret": env.internalServiceSecret
            },
            json: { token },
            throwHttpErrors: false,
            retry: { limit: 0 },
            timeout: { request: INTERNAL_TIMEOUT_MS }
        });
    } catch {
        gatewayAuthVerificationsTotal.inc({ result: "error" });
        throw AppError.badGateway("AUTH_SERVICE_UNAVAILABLE", "Unable to verify session token.");
    }

    const parsedBody: unknown | null = parseJsonSafe(response.body);
    if (response.statusCode === 200 && isRecord(parsedBody)) {
        const userId: unknown = parsedBody.user_id;
        const userRole: unknown = parsedBody.user_role;
        const status: unknown = parsedBody.status;
        if (
            typeof userId === "string" &&
            (userRole === UserSystemRole.USER || userRole === UserSystemRole.ADMIN) &&
            typeof status === "string"
        ) {
            gatewayAuthVerificationsTotal.inc({ result: "valid" });
            return {
                userId,
                userRole,
                status
            };
        }
        gatewayAuthVerificationsTotal.inc({ result: "error" });
        throw AppError.badGateway("AUTH_SERVICE_ERROR", "Authentication service returned an invalid response.");
    }

    if (response.statusCode === 401 || response.statusCode === 403 || response.statusCode === 400) {
        const errorCode: string =
            isRecord(parsedBody) && typeof parsedBody.error_code === "string"
                ? parsedBody.error_code
                : "UNAUTHORIZED";
        const message: string =
            isRecord(parsedBody) && typeof parsedBody.message === "string"
                ? parsedBody.message
                : "Invalid or expired session token.";
        gatewayAuthVerificationsTotal.inc({ result: "invalid" });
        throw AppError.unauthorized(errorCode, message);
    }

    gatewayAuthVerificationsTotal.inc({ result: "error" });
    throw AppError.badGateway("AUTH_SERVICE_UNAVAILABLE", "Unable to verify session token.");
}

export async function fetchUsersMap(
    userIds: Array<string | null | undefined>,
    env: EnvConfig
): Promise<Map<string, UserSummary>> {
    const uniqueIds: string[] = Array.from(
        new Set(
            userIds.filter(
                (id: string | null | undefined): id is string =>
                    typeof id === "string" && id.trim().length > 0
            )
        )
    );
    const result: Map<string, UserSummary> = new Map<string, UserSummary>();
    if (uniqueIds.length === 0) {
        return result;
    }

    const batchUrl: string = `${env.services.user}/api/v1/internal/users/batch`;
    for (let index: number = 0; index < uniqueIds.length; index += USER_BATCH_LIMIT) {
        const chunk: string[] = uniqueIds.slice(index, index + USER_BATCH_LIMIT);
        try {
            const response: GotResponse<string> = await got.post(batchUrl, {
                headers: {
                    Accept: "application/json",
                    "X-Internal-Secret": env.internalServiceSecret
                },
                json: { user_ids: chunk },
                throwHttpErrors: false,
                retry: { limit: 0 },
                timeout: { request: INTERNAL_TIMEOUT_MS }
            });
            if (response.statusCode !== 200) {
                continue;
            }
            const parsed: unknown | null = parseJsonSafe(response.body);
            if (!isRecord(parsed) || !Array.isArray(parsed.users)) {
                continue;
            }
            for (const entry of parsed.users) {
                if (isRecord(entry) && typeof entry.id === "string") {
                    result.set(entry.id, entry as unknown as UserSummary);
                }
            }
        } catch {
            continue;
        }
    }

    return result;
}

export async function fetchOptionalJson(
    url: string,
    headers: Record<string, string>
): Promise<unknown | null> {
    try {
        const response: GotResponse<string> = await got.get(url, {
            headers: {
                Accept: "application/json",
                ...headers
            },
            throwHttpErrors: false,
            retry: { limit: 0 },
            timeout: { request: INTERNAL_TIMEOUT_MS }
        });
        if (response.statusCode !== 200) {
            return null;
        }
        return parseJsonSafe(response.body);
    } catch {
        return null;
    }
}

export async function forwardRequest(
    c: Context<AppEnv>,
    env: EnvConfig,
    options: ForwardOptions
): Promise<Response> {
    const requestUrl: URL = new URL(c.req.url);
    const targetUrl: string = `${env.services[options.service]}${options.upstreamPath}${requestUrl.search}`;
    const user: VerifiedUser | undefined = c.get("user");

    const extraHeaders: Record<string, string> = {};
    const acceptHeader: string | undefined = c.req.header("Accept");
    if (acceptHeader) {
        extraHeaders.Accept = acceptHeader;
    }
    const contentTypeHeader: string | undefined = c.req.header("Content-Type");
    if (contentTypeHeader) {
        extraHeaders["Content-Type"] = contentTypeHeader;
    }
    const idempotencyKey: string | undefined = c.req.header("Idempotency-Key");
    if (idempotencyKey) {
        extraHeaders["Idempotency-Key"] = idempotencyKey;
    }
    if (options.forwardAuthorization) {
        const authorizationHeader: string | undefined = c.req.header("Authorization");
        if (authorizationHeader) {
            extraHeaders.Authorization = authorizationHeader;
        }
    }

    const upstreamHeaders: Record<string, string> = buildUpstreamHeaders(
        env,
        options.service,
        user,
        extraHeaders
    );

    const method: string = c.req.method.toUpperCase();
    let requestBody: Buffer | undefined = undefined;
    if (method !== "GET" && method !== "HEAD") {
        const rawBytes: Buffer = Buffer.from(await c.req.arrayBuffer());
        if (rawBytes.byteLength > 0) {
            requestBody = rawBytes;
        }
    }

    const upstreamStartNs: bigint = process.hrtime.bigint();
    let upstreamResponse: GotResponse<Buffer>;
    try {
        upstreamResponse = await got(targetUrl, {
            method: method as Method,
            headers: upstreamHeaders,
            body: requestBody,
            throwHttpErrors: false,
            retry: { limit: 0 },
            responseType: "buffer",
            timeout: { request: UPSTREAM_TIMEOUT_MS }
        });
    } catch {
        const elapsedSeconds: number = Number(process.hrtime.bigint() - upstreamStartNs) / 1e9;
        gatewayUpstreamDurationSeconds.observe({ upstream: options.service }, elapsedSeconds);
        gatewayUpstreamRequestsTotal.inc({ upstream: options.service, status_class: "error" });
        throw AppError.badGateway("UPSTREAM_UNAVAILABLE", "Upstream service is unavailable.");
    }

    const upstreamSeconds: number = Number(process.hrtime.bigint() - upstreamStartNs) / 1e9;
    gatewayUpstreamDurationSeconds.observe({ upstream: options.service }, upstreamSeconds);
    gatewayUpstreamRequestsTotal.inc({
        upstream: options.service,
        status_class: toStatusClass(upstreamResponse.statusCode)
    });

    if (upstreamResponse.statusCode === 204 || upstreamResponse.statusCode === 304) {
        return new Response(null, { status: upstreamResponse.statusCode });
    }

    const rawResponseType: string | string[] | undefined = upstreamResponse.headers["content-type"];
    const responseContentType: string = Array.isArray(rawResponseType)
        ? (rawResponseType[0] ?? "")
        : (rawResponseType ?? "");

    if (
        options.compose !== undefined &&
        upstreamResponse.statusCode >= 200 &&
        upstreamResponse.statusCode < 300 &&
        responseContentType.toLowerCase().includes("application/json")
    ) {
        const parsedPayload: unknown | null = parseJsonSafe(
            Buffer.from(upstreamResponse.rawBody).toString("utf8")
        );
        if (parsedPayload !== null) {
            const composedPayload: unknown = await options.compose(parsedPayload, { env, user });
            return c.json(composedPayload, upstreamResponse.statusCode as ContentfulStatusCode);
        }
    }

    const responseHeaders: Record<string, string> = {};
    if (responseContentType.length > 0) {
        responseHeaders["Content-Type"] = responseContentType;
    }

    return new Response(new Uint8Array(upstreamResponse.rawBody), {
        status: upstreamResponse.statusCode,
        headers: responseHeaders
    });
}
