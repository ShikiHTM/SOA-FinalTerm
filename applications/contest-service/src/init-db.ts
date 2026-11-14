import "dotenv/config";
import { db } from "./common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
async function main(): Promise<void> {
    await db.query(readFileSync(resolve(process.cwd(), "schema.sql"), "utf8"));
    console.log("Database schema initialized");
    await db.end();
}
main().catch((e: unknown) => { console.error(e); process.exit(1); });
