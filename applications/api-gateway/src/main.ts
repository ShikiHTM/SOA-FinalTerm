import { serve, type ServerType } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnvConfig, type EnvConfig } from "./shared/env";

function bootstrap(): void {
    const env: EnvConfig = loadEnvConfig();
    const app = createApp({ env });
    const server: ServerType = serve({
        fetch: app.fetch,
        port: env.port
    });

    const shutdown = (): void => {
        server.close();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

bootstrap();
