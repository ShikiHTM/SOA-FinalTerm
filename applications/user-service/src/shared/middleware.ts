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

function attachValidatedIdentityHeaders(
    c: Context<AppEnv>,
    rawUserId: string | undefined,
    rawUserRole: string | undefined
): void {
    const parsed: ReturnType<typeof AUTHENTICATED_HEADERS_SCHEMA.safeParse> =
        AUTHENTICATED_HEADERS_SCHEMA.safeParse({
            "x-user-id": rawUserId,
            "x-user-role": rawUserRole
        });
    if (!parsed.success) {
        throw AppError.unauthorized(
            "UNAUTHORIZED",
            "Valid X-User-Id and X-User-Role headers are required."
        );
    }
    c.set("userId", parsed.data["x-user-id"]);
    c.set("userRole", parsed.data["x-user-role"]);
}

type ValidationHookResult<
    Schema extends ZodType<unknown, ZodTypeDef, unknown>,
    Target extends keyof ValidationTargets
> = (
    | { success: true; data: z.TypeOf<Schema> }
    | { success: false; error: ZodError; data: z.TypeOf<Schema> }
) & {
    target: Target;
};

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
    attachValidatedIdentityHeaders(c, c.req.header("X-User-Id"), c.req.header("X-User-Role"));
    await next();
};

export const optionalAuthenticatedHeaders: MiddlewareHandler<AppEnv> = async (
    c,
    next
): Promise<void> => {
    const rawUserId: string | undefined = c.req.header("X-User-Id");
    const rawUserRole: string | undefined = c.req.header("X-User-Role");
    if (rawUserId === undefined && rawUserRole === undefined) {
        await next();
        return;
    }
    attachValidatedIdentityHeaders(c, rawUserId, rawUserRole);
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
                const details: string[] = result.error.issues.map((issue: ZodIssue): string => {
                    const path: string = issue.path.join(".");
                    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
                });
                throw AppError.badRequest("VALIDATION_ERROR", "Request validation failed.", details);
            }
        }
    ) as unknown as MiddlewareHandler<
        AppEnv,
        string,
        { in: { [K in Target]: z.input<Schema> }; out: { [K in Target]: z.output<Schema> } }
    >;
}
