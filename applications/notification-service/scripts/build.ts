import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_DIR: string = fileURLToPath(new URL("..", import.meta.url));
const WORKSPACE_DIR: string = resolve(SERVICE_DIR, "../..");
const OUTPUT_DIR: string = resolve(WORKSPACE_DIR, "dist/applications/notification-service");
const COMPILER: string = resolve(WORKSPACE_DIR, "node_modules/typescript/bin/tsc");

execFileSync(process.execPath, [COMPILER, "--project", "tsconfig.build.json"], {
    cwd: SERVICE_DIR,
    stdio: "inherit"
});

mkdirSync(OUTPUT_DIR, { recursive: true });
cpSync(resolve(SERVICE_DIR, "migrations"), resolve(OUTPUT_DIR, "migrations"), { recursive: true });
const manifest: Record<string, unknown> = JSON.parse(readFileSync(resolve(SERVICE_DIR, "package.json"), "utf8")) as Record<string, unknown>;
manifest.scripts = { start: "node src/index.js" };
delete manifest.devDependencies;
writeFileSync(resolve(OUTPUT_DIR, "package.json"), `${JSON.stringify(manifest, null, 4)}\n`);
