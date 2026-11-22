export interface EnvConfig {
    port: number;
    dbHost: string;
    dbPort: number;
    dbUser: string;
    dbPassword: string;
    dbName: string;
    dbSyncSchema: boolean;
    internalServiceSecret: string;
    groupServiceUrl: string;
    assessmentServiceUrl: string;
    corsAllowedOrigins: string[];
}

const DEFAULT_PORT: number = 8004;
const DEFAULT_DB_PORT: number = 5432;
const DEFAULT_GROUP_SERVICE_URL: string = "http://localhost:8002";
const DEFAULT_ASSESSMENT_SERVICE_URL: string = "http://localhost:8003";
const DEFAULT_CORS_ALLOWED_ORIGINS: string = "http://localhost:8080,http://127.0.0.1:8080";

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    if (!rawValue) {
        return fallback;
    }
    const parsed: number = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function parseCsvList(rawValue: string | undefined, fallback: string): string[] {
    const source: string = rawValue && rawValue.trim().length > 0 ? rawValue : fallback;
    return source
        .split(",")
        .map((item: string): string => item.trim())
        .filter((item: string): boolean => item.length > 0);
}

export function loadEnvConfig(envSource: Record<string, string | undefined> = process.env): EnvConfig {
    return {
        port: parsePositiveInt(envSource.PORT, DEFAULT_PORT),
        dbHost: envSource.CONTEST_DB_HOST ?? "localhost",
        dbPort: parsePositiveInt(envSource.CONTEST_DB_PORT, DEFAULT_DB_PORT),
        dbUser: envSource.CONTEST_DB_USER ?? "contest_service",
        dbPassword: envSource.CONTEST_DB_PASSWORD ?? "contest_service_dev",
        dbName: envSource.CONTEST_DB_NAME ?? "contest_db",
        dbSyncSchema: envSource.CONTEST_DB_SYNC_SCHEMA === "true",
        internalServiceSecret: envSource.INTERNAL_SERVICE_SECRET ?? "",
        groupServiceUrl: (envSource.GROUP_SERVICE_URL ?? DEFAULT_GROUP_SERVICE_URL).replace(
            /\/+$/,
            ""
        ),
        assessmentServiceUrl: (
            envSource.ASSESSMENT_SERVICE_URL ?? DEFAULT_ASSESSMENT_SERVICE_URL
        ).replace(/\/+$/, ""),
        corsAllowedOrigins: parseCsvList(
            envSource.CORS_ALLOWED_ORIGINS,
            DEFAULT_CORS_ALLOWED_ORIGINS
        )
    };
}
