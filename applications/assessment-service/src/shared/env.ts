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
    s3Region: string;
    s3Bucket: string;
    s3Endpoint: string;
    s3PublicEndpoint: string;
    s3ForcePathStyle: boolean;
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
    s3PresignExpiresInSeconds: number;
    s3MaxPdfBytes: number;
    s3AutoCreateBucket: boolean;
    corsAllowedOrigins: string[];
}

const DEFAULT_PORT: number = 8003;
const DEFAULT_DB_PORT: number = 5432;
const DEFAULT_GROUP_SERVICE_URL: string = "http://localhost:8002";
const DEFAULT_S3_REGION: string = "ap-southeast-1";
const DEFAULT_S3_BUCKET: string = "lms-assessments";
const DEFAULT_S3_PRESIGN_EXPIRES_IN_SECONDS: number = 900;
const MIN_PRESIGN_TTL_SECONDS: number = 60;
const MAX_PRESIGN_TTL_SECONDS: number = 3600;
const DEFAULT_S3_MAX_PDF_BYTES: number = 20 * 1024 * 1024;
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

function clampInt(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
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
    const dbHost: string = envSource.ASSESSMENT_DB_HOST ?? "localhost";
    const dbPort: number = parsePositiveInt(envSource.ASSESSMENT_DB_PORT, DEFAULT_DB_PORT);
    const dbUser: string = envSource.ASSESSMENT_DB_USER ?? "assessment_service";
    const dbPassword: string = envSource.ASSESSMENT_DB_PASSWORD ?? "assessment_service_dev";
    const dbName: string = envSource.ASSESSMENT_DB_NAME ?? "assessment_db";
    const dbSyncSchema: boolean = envSource.ASSESSMENT_DB_SYNC_SCHEMA === "true";
    const internalServiceSecret: string = envSource.INTERNAL_SERVICE_SECRET ?? "";
    const groupServiceUrl: string = (
        envSource.GROUP_SERVICE_URL ?? DEFAULT_GROUP_SERVICE_URL
    ).replace(/\/+$/, "");
    const s3Region: string =
        envSource.S3_REGION && envSource.S3_REGION.trim().length > 0
            ? envSource.S3_REGION.trim()
            : DEFAULT_S3_REGION;
    const s3Bucket: string =
        envSource.S3_BUCKET && envSource.S3_BUCKET.trim().length > 0
            ? envSource.S3_BUCKET.trim()
            : DEFAULT_S3_BUCKET;
    const s3Endpoint: string = envSource.S3_ENDPOINT?.trim() ?? "";
    const s3PublicEndpoint: string = envSource.S3_PUBLIC_ENDPOINT?.trim() ?? "";
    const s3ForcePathStyle: boolean = envSource.S3_FORCE_PATH_STYLE === "true";
    const s3AccessKeyId: string = envSource.S3_ACCESS_KEY_ID ?? "";
    const s3SecretAccessKey: string = envSource.S3_SECRET_ACCESS_KEY ?? "";
    const s3PresignExpiresInSeconds: number = clampInt(
        parsePositiveInt(
            envSource.S3_PRESIGN_EXPIRES_IN_SECONDS,
            DEFAULT_S3_PRESIGN_EXPIRES_IN_SECONDS
        ),
        MIN_PRESIGN_TTL_SECONDS,
        MAX_PRESIGN_TTL_SECONDS
    );
    const s3MaxPdfBytes: number = parsePositiveInt(
        envSource.S3_MAX_PDF_BYTES,
        DEFAULT_S3_MAX_PDF_BYTES
    );
    const s3AutoCreateBucket: boolean = envSource.S3_AUTO_CREATE_BUCKET === "true";
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
        groupServiceUrl,
        s3Region,
        s3Bucket,
        s3Endpoint,
        s3PublicEndpoint,
        s3ForcePathStyle,
        s3AccessKeyId,
        s3SecretAccessKey,
        s3PresignExpiresInSeconds,
        s3MaxPdfBytes,
        s3AutoCreateBucket,
        corsAllowedOrigins
    };
}
