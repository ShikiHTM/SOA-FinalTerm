import "dotenv/config";
import { serve } from "@hono/node-server";
import { app, db } from "./common";
import "./routes";
const port: number = Number(process.env.PORT ?? 5105);
async function start(): Promise<void> {
    await db.query("SELECT 1");
    serve({ fetch: app.fetch, port });
    console.log("group-service listening on " + port);
}
start().catch((error: unknown) => { console.error(error); process.exit(1); });
