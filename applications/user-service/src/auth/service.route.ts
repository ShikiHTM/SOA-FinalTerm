import type { EntityManager } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import type { EnvConfig } from "../shared/env";
import { createZodValidator } from "../shared/middleware";
import type { AppEnv, VerifiedTokenResult } from "../shared/types";
import { verifySessionToken } from "./auth.token";
import { VerifyTokenRequestSchema } from "./schemas/auth.schema";

export function createServiceRoute(env: EnvConfig): Hono<AppEnv> {
    const router: Hono<AppEnv> = new Hono<AppEnv>();

    router.post(
        "/auth/verify",
        createZodValidator("json", VerifyTokenRequestSchema),
        async (c): Promise<Response> => {
            const payload: { token: string } = c.req.valid("json");
            const em: EntityManager = c.get("em");
            const result: VerifiedTokenResult = await verifySessionToken(
                payload.token,
                env.jwtSecret,
                em
            );
            return c.json(result, 200);
        }
    );

    return router;
}
