export interface EnvConfig {
    port: number;
    dbHost: string;
    dbPort: number;
    dbUser: string;
    dbPassword: string;
    dbName: string;
    dbSyncSchema: boolean;
    internalServiceSecret: string;
    jwtSecret: string;
    jwtExpiresInSeconds: number;
    googleClientId: string;
    googleClientSecret: string;
    githubClientId: string;
    githubClientSecret: string;
    corsAllowedOrigins: string[];
}

const DEFAULT_PORT: number = 3031;
const DEFAULT_DB_PORT: number = 5432;
const DEFAULT_JWT_EXPIRES_IN_SECONDS: number = 86400;
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
    const port: number = parsePositiveInt(envSource.PORT, DEFAULT_PORT);
    const dbHost: string = envSource.USER_DB_HOST ?? "localhost";
    const dbPort: number = parsePositiveInt(envSource.USER_DB_PORT, DEFAULT_DB_PORT);
    const dbUser: string = envSource.USER_DB_USER ?? "user_service";
    const dbPassword: string = envSource.USER_DB_PASSWORD ?? "user_service_dev";
    const dbName: string = envSource.USER_DB_NAME ?? "user_db";
    const dbSyncSchema: boolean = envSource.USER_DB_SYNC_SCHEMA === "true";
    const internalServiceSecret: string = envSource.INTERNAL_SERVICE_SECRET ?? "";
    const jwtSecret: string = envSource.JWT_SECRET ?? "";
    const jwtExpiresInSeconds: number = parsePositiveInt(
        envSource.JWT_EXPIRES_IN_SECONDS,
        DEFAULT_JWT_EXPIRES_IN_SECONDS
    );
    const googleClientId: string = envSource.GOOGLE_CLIENT_ID ?? "";
    const googleClientSecret: string = envSource.GOOGLE_CLIENT_SECRET ?? "";
    const githubClientId: string = envSource.GITHUB_CLIENT_ID ?? "";
    const githubClientSecret: string = envSource.GITHUB_CLIENT_SECRET ?? "";
    const corsAllowedOrigins: string[] = parseCsvList(
        envSource.CORS_ALLOWED_ORIGINS,
        DEFAULT_CORS_ALLOWED_ORIGINS
    );

    return {
        port,
        dbHost,
        dbPort,
        dbUser,
        dbPassword,
        dbName,
        dbSyncSchema,
        internalServiceSecret,
        jwtSecret,
        jwtExpiresInSeconds,
        googleClientId,
        googleClientSecret,
        githubClientId,
        githubClientSecret,
        corsAllowedOrigins
    };
}
