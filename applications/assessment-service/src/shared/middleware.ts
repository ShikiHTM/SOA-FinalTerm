import { timingSafeEqual } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { Context, MiddlewareHandler, ValidationTargets } from "hono";
import { z, type ZodError, type ZodIssue, type ZodType, type ZodTypeDef } from "zod";
import { AppError } from "./errors";
import { UserSystemRole, type AppEnv } from "./types";

const AUTHENTICATED_HEADERS_SCHEMA = z.object({
    "x-user-id": z.string().uuid("X-User-Id must be a valid UUID."),
    "x-user-role": z.nativeEnum(UserSystemRole)
});

type ValidationHookResult<
    Schema extends ZodType<unknown, ZodTypeDef, unknown>,
    Target extends keyof ValidationTargets
> = (
    | { success: true; data: z.TypeOf<Schema> }
    | { success: false; error: ZodError; data: z.TypeOf<Schema> }
) & {
    target: Target;
};

export function formatZodIssues(issues: ZodIssue[]): string[] {
    return issues.map((issue: ZodIssue): string => {
        const path: string = issue.path.join(".");
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    });
}

export function requireInternalSecret(expectedSecret: string): MiddlewareHandler<AppEnv> {
    return async (c, next): Promise<void> => {
        const providedSecret: string | undefined = c.req.header("X-Internal-Secret");
        if (!providedSecret) {
            throw AppError.unauthorized(
                "MISSING_INTERNAL_SECRET",
                "X-Internal-Secret header is required."
            );
        }
        const expectedBuffer: Buffer = Buffer.from(expectedSecret, "utf8");
        const providedBuffer: Buffer = Buffer.from(providedSecret, "utf8");
        const isValidSecret: boolean =
            expectedSecret.length > 0 &&
            expectedBuffer.length === providedBuffer.length &&
            timingSafeEqual(expectedBuffer, providedBuffer);
        if (!isValidSecret) {
            throw AppError.forbidden(
                "INVALID_INTERNAL_SECRET",
                "Invalid X-Internal-Secret header."
            );
        }
        await next();
    };
}

export const requireAuthenticatedHeaders: MiddlewareHandler<AppEnv> = async (
    c,
    next
): Promise<void> => {
    const parsed: ReturnType<typeof AUTHENTICATED_HEADERS_SCHEMA.safeParse> =
        AUTHENTICATED_HEADERS_SCHEMA.safeParse({
            "x-user-id": c.req.header("X-User-Id"),
            "x-user-role": c.req.header("X-User-Role")
        });
    if (!parsed.success) {
        throw AppError.unauthorized(
            "UNAUTHORIZED",
            "Valid X-User-Id and X-User-Role headers are required."
        );
    }
    c.set("userId", parsed.data["x-user-id"]);
    c.set("userRole", parsed.data["x-user-role"]);
    await next();
};

export const requireAdminRole: MiddlewareHandler<AppEnv> = async (c, next): Promise<void> => {
    if (c.get("userRole") !== UserSystemRole.ADMIN) {
        throw AppError.forbidden("ADMIN_REQUIRED", "Administrator privileges are required.");
    }
    await next();
};

export function attachEntityManager(
    forkEntityManager: () => EntityManager
): MiddlewareHandler<AppEnv> {
    return async (c, next): Promise<void> => {
        const forkedEm: EntityManager = forkEntityManager();
        c.set("em", forkedEm);
        await next();
    };
}

export function createZodValidator<
    Target extends keyof ValidationTargets,
    Schema extends ZodType<unknown, ZodTypeDef, unknown>
>(
    target: Target,
    schema: Schema
): MiddlewareHandler<
    AppEnv,
    string,
    { in: { [K in Target]: z.input<Schema> }; out: { [K in Target]: z.output<Schema> } }
> {
    return zValidator(
        target,
        schema,
        (result: ValidationHookResult<Schema, Target>): void => {
            if (!result.success) {
                throw AppError.badRequest(
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    formatZodIssues(result.error.issues)
                );
            }
        }
    ) as unknown as MiddlewareHandler<
        AppEnv,
        string,
        { in: { [K in Target]: z.input<Schema> }; out: { [K in Target]: z.output<Schema> } }
    >;
}

export async function parseOptionalJsonBody<T>(
    c: Context<AppEnv>,
    schema: ZodType<T, ZodTypeDef, unknown>
): Promise<T> {
    const rawBody: string = await c.req.text();
    let rawJson: unknown = {};
    if (rawBody.trim().length > 0) {
        try {
            rawJson = JSON.parse(rawBody);
        } catch {
            throw AppError.badRequest("VALIDATION_ERROR", "Malformed JSON request body.");
        }
    }
    const parsed: z.SafeParseReturnType<unknown, T> = await schema.safeParseAsync(rawJson);
    if (!parsed.success) {
        throw AppError.badRequest(
            "VALIDATION_ERROR",
            "Request validation failed.",
            formatZodIssues(parsed.error.issues)
        );
    }
    return parsed.data;
}
