import type { ServiceKey } from "./types";

export interface EnvConfig {
    port: number;
    internalServiceSecret: string;
    services: Record<ServiceKey, string>;
    corsAllowedOrigins: string[];
}

const DEFAULT_PORT: number = 3000;
const DEFAULT_CORS_ALLOWED_ORIGINS: string =
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080";

const DEFAULT_SERVICE_URLS: Record<ServiceKey, string> = {
    user: "http://localhost:3031",
    group: "http://localhost:8002",
    assessment: "http://localhost:8003",
    contest: "http://localhost:8004",
    submission: "http://localhost:8005",
    notification: "http://localhost:3037"
};

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

function normalizeUrl(rawUrl: string | undefined, fallback: string): string {
    const chosen: string = rawUrl && rawUrl.trim().length > 0 ? rawUrl.trim() : fallback;
    return chosen.replace(/\/+$/, "");
}

export function loadEnvConfig(
    envSource: Record<string, string | undefined> = process.env
): EnvConfig {
    return {
        port: parsePositiveInt(envSource.PORT, DEFAULT_PORT),
        internalServiceSecret: envSource.INTERNAL_SERVICE_SECRET ?? "",
        services: {
            user: normalizeUrl(envSource.USER_SERVICE_URL, DEFAULT_SERVICE_URLS.user),
            group: normalizeUrl(envSource.GROUP_SERVICE_URL, DEFAULT_SERVICE_URLS.group),
            assessment: normalizeUrl(
                envSource.ASSESSMENT_SERVICE_URL,
                DEFAULT_SERVICE_URLS.assessment
            ),
            contest: normalizeUrl(envSource.CONTEST_SERVICE_URL, DEFAULT_SERVICE_URLS.contest),
            submission: normalizeUrl(
                envSource.SUBMISSION_SERVICE_URL,
                DEFAULT_SERVICE_URLS.submission
            ),
            notification: normalizeUrl(
                envSource.NOTIFICATION_SERVICE_URL,
                DEFAULT_SERVICE_URLS.notification
            )
        },
        corsAllowedOrigins: parseCsvList(
            envSource.CORS_ALLOWED_ORIGINS,
            DEFAULT_CORS_ALLOWED_ORIGINS
        )
    };
}
