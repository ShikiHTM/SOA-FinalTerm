import ky, {
    HTTPError,
    isNetworkError,
    isTimeoutError,
    type BeforeErrorState,
    type BeforeRequestState,
    type KyInstance,
    type Options
} from "ky";

export { HTTPError };

export interface ApiClientOptions {
    prefix: string;
    getAccessToken?: () => string;
    fetch?: Options["fetch"];
}

export function normalizeApiPrefix(rawUrl: string): string {
    const trimmed: string = rawUrl.trim();
    if (!trimmed) {
        throw new Error("Invalid API Gateway URL.");
    }
    if (trimmed.startsWith("/")) {
        if (trimmed.startsWith("//") || trimmed.includes("?") || trimmed.includes("#")) {
            throw new Error("Invalid API Gateway URL.");
        }
        const stripped: string = trimmed.replace(/\/+$/, "");
        return stripped.length > 0 ? stripped : "/";
    }
    const parsed: URL = new URL(trimmed);
    if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error("Invalid API Gateway URL.");
    }
    const normalizedPath: string = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${normalizedPath}`;
}

function tryParseJson(raw: string): unknown {
    const trimmed: string = raw.trim();
    if (!trimmed) {
        return raw;
    }
    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return raw;
    }
}

function formatGatewayErrorPayload(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return null;
    }
    const body: Record<string, unknown> = payload as Record<string, unknown>;
    const message: string =
        typeof body.message === "string" && body.message.trim().length > 0
            ? body.message.trim()
            : "";
    const detailText: string = Array.isArray(body.details)
        ? body.details
              .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
              .map((item: string): string => item.trim())
              .join(" ")
        : "";
    if (message && detailText) {
        return `${message} ${detailText}`;
    }
    if (message) {
        return message;
    }
    if (detailText) {
        return detailText;
    }
    return null;
}

export function extractErrorMessage(error: unknown, fallback: string): string {
    if (isNetworkError(error)) {
        return "Unable to reach the API Gateway. Please check that the server is running.";
    }
    if (isTimeoutError(error)) {
        return "Request to the API Gateway timed out. Please try again.";
    }
    if (error instanceof HTTPError) {
        const rawPayload: unknown =
            typeof error.data === "string" ? tryParseJson(error.data) : error.data;
        const payloadMessage: string | null = formatGatewayErrorPayload(rawPayload);
        if (payloadMessage) {
            return payloadMessage;
        }
        if (error.message.trim().length > 0) {
            return error.message;
        }
        return fallback;
    }
    if (error instanceof Error) {
        const message: string = error.message.trim();
        if (
            message === "Failed to fetch" ||
            message === "Load failed" ||
            message.startsWith("NetworkError")
        ) {
            return "Unable to reach the API Gateway. Please check that the server is running.";
        }
        if (message.length > 0) {
            return message;
        }
    }
    return fallback;
}

export function createApiClient(options: ApiClientOptions): KyInstance {
    const normalizedPrefix: string = normalizeApiPrefix(options.prefix);
    const isRelativePrefix: boolean = normalizedPrefix.startsWith("/");
    let expectedOrigin: string | null = null;
    let expectedPath: string = "";

    if (isRelativePrefix) {
        expectedPath = normalizedPrefix === "/" ? "" : normalizedPrefix;
    } else {
        const parsedPrefix: URL = new URL(normalizedPrefix);
        expectedOrigin = parsedPrefix.origin;
        expectedPath = parsedPrefix.pathname.replace(/\/+$/, "");
    }

    const kyOptions: Options = {
        prefix: normalizedPrefix,
        retry: 0,
        timeout: 15000,
        hooks: {
            beforeRequest: [
                ({ request }: BeforeRequestState): void => {
                    const fallbackOrigin: string =
                        typeof window !== "undefined" ? window.location.origin : "http://localhost";
                    const resolvedUrl: URL = new URL(request.url, fallbackOrigin);
                    if (expectedOrigin !== null && resolvedUrl.origin !== expectedOrigin) {
                        throw new Error("API path escapes the configured Gateway base URL.");
                    }
                    if (
                        expectedPath.length > 0 &&
                        resolvedUrl.pathname !== expectedPath &&
                        !resolvedUrl.pathname.startsWith(`${expectedPath}/`)
                    ) {
                        throw new Error("API path escapes the configured Gateway base URL.");
                    }
                    const token: string = options.getAccessToken ? options.getAccessToken() : "";
                    if (token) {
                        request.headers.set("Authorization", `Bearer ${token}`);
                    }
                }
            ],
            beforeError: [
                ({ error }: BeforeErrorState): Error => {
                    if (error instanceof HTTPError) {
                        const rawPayload: unknown =
                            typeof error.data === "string"
                                ? tryParseJson(error.data)
                                : error.data;
                        const message: string | null = formatGatewayErrorPayload(rawPayload);
                        if (message) {
                            error.message = message;
                        }
                    }
                    return error;
                }
            ]
        }
    };

    if (options.fetch !== undefined) {
        kyOptions.fetch = options.fetch;
    }

    return ky.create(kyOptions);
}
