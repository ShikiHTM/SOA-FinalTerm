export class HttpError extends Error {
    readonly status: number;
    readonly payload: unknown;

    constructor(status: number, payload: unknown) {
        super(`HTTP ${status}`);
        this.name = "HttpError";
        this.status = status;
        this.payload = payload;
    }
}

/** HTTP cơ bản; adapter chịu trách nhiệm chọn endpoint, xác thực và xử lý dữ liệu. */
export class HttpClient {
    private readonly baseUrl: URL;
    private readonly fetchRequest: typeof fetch;

    constructor(baseUrl: string, fetchRequest: typeof fetch = fetch) {
        const parsed: URL = new URL(baseUrl);
        if (
            !["http:", "https:"].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password ||
            parsed.search ||
            parsed.hash
        ) {
            throw new Error("Địa chỉ Gateway không hợp lệ.");
        }
        if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
        this.baseUrl = parsed;
        this.fetchRequest = fetchRequest;
    }

    async requestJson<T>(path: string, init?: RequestInit): Promise<T | null> {
        if (!path || path.startsWith("/") || path.startsWith("\\")) {
            throw new Error("Đường dẫn API phải tương đối với địa chỉ Gateway.");
        }
        const url: URL = new URL(path, this.baseUrl);
        if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith(this.baseUrl.pathname)) {
            throw new Error("Đường dẫn API nằm ngoài địa chỉ Gateway.");
        }

        const response: Response = await this.fetchRequest(url, init);
        if (response.status === 204 || response.status === 205) return null;

        const text: string = await response.text();
        let payload: unknown = null;
        if (text) {
            try {
                payload = JSON.parse(text) as unknown;
            } catch {
                if (response.ok) throw new Error("Phản hồi API không phải JSON hợp lệ.");
                payload = text;
            }
        }

        if (!response.ok) throw new HttpError(response.status, payload);
        return payload as T | null;
    }
}
