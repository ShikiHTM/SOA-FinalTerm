import { serve, type ServerType } from "@hono/node-server";
import { createApp } from "./app";
import { closeDB, connectDB, getORM } from "./db/orm";
import { loadEnvConfig, type EnvConfig } from "./shared/env";

async function bootstrap(): Promise<void> {
    const env: EnvConfig = loadEnvConfig();
    await connectDB();
    if (env.dbSyncSchema) {
        await getORM().schema.update();
    }

    const app: ReturnType<typeof createApp> = createApp({ env });
    const server: ServerType = serve({
        fetch: app.fetch,
        port: env.port
    });

    const shutdown: () => Promise<void> = async (): Promise<void> => {
        server.close();
        await closeDB();
        process.exit(0);
    };

    process.on("SIGINT", (): void => {
        void shutdown();
    });
    process.on("SIGTERM", (): void => {
        void shutdown();
    });
}

void bootstrap();
