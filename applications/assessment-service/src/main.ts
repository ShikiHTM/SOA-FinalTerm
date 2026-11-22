import { serve, type ServerType } from "@hono/node-server";
import { createApp } from "./app";
import { closeDB, connectDB, getORM } from "./db/orm";
import { loadEnvConfig, type EnvConfig } from "./shared/env";
import {
    closeS3Clients,
    createS3AssessmentStorage,
    type AssessmentStorage
} from "./storage/s3.storage";

async function bootstrap(): Promise<void> {
    const env: EnvConfig = loadEnvConfig();
    await connectDB();
    if (env.dbSyncSchema) {
        await getORM().schema.update();
    }
    const storage: AssessmentStorage = createS3AssessmentStorage(env);
    await storage.ensureBucket();

    const app: ReturnType<typeof createApp> = createApp({ env, storage });
    const server: ServerType = serve({
        fetch: app.fetch,
        port: env.port
    });

    const shutdown: () => Promise<void> = async (): Promise<void> => {
        server.close();
        closeS3Clients();
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
