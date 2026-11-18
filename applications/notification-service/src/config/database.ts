import { readFile } from "node:fs/promises";
import pg from "pg";
import { type Pool, type PoolConfig } from "pg";

export async function connectDatabase(): Promise<Pool> {
    const databaseUrl: string | undefined = process.env.NOTIFICATION_DATABASE_URL;
    const databaseOptions: PoolConfig = databaseUrl ? { connectionString: databaseUrl } : {
        host: process.env.NOTIFICATION_DB_HOST ?? "localhost",
        port: Number(process.env.NOTIFICATION_DB_PORT ?? "5432"),
        user: process.env.NOTIFICATION_DB_USER ?? "notification",
        password: process.env.NOTIFICATION_DB_PASSWORD ?? "notification_dev",
        database: process.env.NOTIFICATION_DB_NAME ?? "notification_db"
    };
    const pool: Pool = new pg.Pool(databaseOptions);

    try {
        const migration: string = await readFile(new URL("../../migrations/001_initial.sql", import.meta.url), "utf8");
        await pool.query(migration);
        return pool;
    } catch (error: unknown) {
        await pool.end();
        throw error;
    }
}
