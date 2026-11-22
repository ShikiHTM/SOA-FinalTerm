import { defineConfig } from "rolldown";
import packageJson from "./package.json" with { type: "json" };

const dependencies: string[] = Object.keys(packageJson.dependencies);

export default defineConfig([
    {
        input: "src/main.ts",
        platform: "node",
        tsconfig: "tsconfig.app.json",
        external: (id: string): boolean => {
            return dependencies.some((dep: string): boolean => id === dep || id.startsWith(`${dep}/`));
        },
        output: {
            dir: "../../dist/applications/api-gateway",
            cleanDir: true,
            format: "cjs",
            sourcemap: true
        }
    }
]);
