import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Pool } from "pg";
import { z, ZodError } from "zod";

export const db: Pool = new Pool({ connectionString: process.env.DATABASE_URL });
export type Identity = { userId: string; role: string };
export const app = new Hono<{ Variables: { identity: Identity } }>();
export const uuid = z.string().uuid();
export const fail = (status: number, message: string): never => { throw new HTTPException(status as 400, { message }); };
export const validate = <T>(schema: z.ZodType<T>, value: unknown): T => schema.parse(value);
export const actor = (c: any): Identity => c.get("identity") as Identity;
export const internal = (c: any): void => {
    const secret: string | undefined = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret || c.req.header("x-internal-secret") !== secret) fail(403, "Invalid internal secret");
};
app.onError((error, c) => {
    if (error instanceof ZodError) return c.json({ error: "Validation failed", details: error.flatten() }, 400);
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
});
app.get("/health", (c) => c.json({ service: process.env.SERVICE_NAME, status: "ok" }));
app.use("/api/*", async (c, next) => {
    internal(c);
    const userId: string = c.req.header("x-user-id") ?? "";
    const role: string = c.req.header("x-user-role") ?? "";
    if (!userId) fail(401, "Missing forwarded user identity");
    c.set("identity", { userId, role });
    await next();
});
