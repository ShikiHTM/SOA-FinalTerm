import path from "node:path";
import { defineConfig, loadEnv, type UserConfig } from "vite";

export default defineConfig(({ mode }: { mode: string }): UserConfig => {
    const localEnv: Record<string, string> = loadEnv(mode, process.cwd(), "");
    const rootEnv: Record<string, string> = loadEnv(
        mode,
        path.resolve(process.cwd(), "../.."),
        ""
    );
    const proxyTarget: string =
        localEnv.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";
    const googleClientId: string =
        localEnv.VITE_GOOGLE_CLIENT_ID ||
        process.env.VITE_GOOGLE_CLIENT_ID ||
        rootEnv.VITE_GOOGLE_CLIENT_ID ||
        rootEnv.GOOGLE_CLIENT_ID ||
        "";
    const githubClientId: string =
        localEnv.VITE_GITHUB_CLIENT_ID ||
        process.env.VITE_GITHUB_CLIENT_ID ||
        rootEnv.VITE_GITHUB_CLIENT_ID ||
        rootEnv.GITHUB_CLIENT_ID ||
        "";

    return {
        define: {
            "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(googleClientId),
            "import.meta.env.VITE_GITHUB_CLIENT_ID": JSON.stringify(githubClientId)
        },
        server: {
            host: "0.0.0.0",
            port: 5173,
            proxy: {
                "/api": {
                    target: proxyTarget,
                    changeOrigin: true
                }
            }
        },
        preview: {
            host: "0.0.0.0",
            port: 4173,
            proxy: {
                "/api": {
                    target: proxyTarget,
                    changeOrigin: true
                }
            }
        }
    };
});
