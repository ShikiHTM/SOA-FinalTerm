import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { createApp } from "../src/app";
import type { EnvConfig } from "../src/shared/env";
import { UserSystemRole } from "../src/shared/types";

interface RecordedRequest {
    method: string;
    path: string;
    query: string;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
}

interface MockResponse {
    status?: number;
    contentType?: string;
    body?: unknown;
}

interface MockUpstream {
    url: string;
    requests: RecordedRequest[];
    close(): Promise<void>;
}

function readIncomingBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject): void => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer): void => {
            chunks.push(chunk);
        });
        req.on("end", (): void => {
            resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
    });
}

async function startMockUpstream(
    handler: (req: RecordedRequest) => MockResponse | Promise<MockResponse>
): Promise<MockUpstream> {
    const requests: RecordedRequest[] = [];
    const server: Server = createServer(
        async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
            const rawUrl: string = req.url ?? "/";
            const parsedUrl: URL = new URL(rawUrl, "http://127.0.0.1");
            const body: Buffer = await readIncomingBody(req);
            const recorded: RecordedRequest = {
                method: req.method ?? "GET",
                path: parsedUrl.pathname,
                query: parsedUrl.search,
                headers: req.headers,
                body
            };
            requests.push(recorded);

            const mockRes: MockResponse = await handler(recorded);
            const status: number = mockRes.status ?? 200;
            if (status === 204) {
                res.statusCode = 204;
                res.end();
                return;
            }
            const contentType: string = mockRes.contentType ?? "application/json";
            res.statusCode = status;
            res.setHeader("Content-Type", contentType);
            if (Buffer.isBuffer(mockRes.body)) {
                res.end(mockRes.body);
                return;
            }
            res.end(
                typeof mockRes.body === "string"
                    ? mockRes.body
                    : JSON.stringify(mockRes.body ?? {})
            );
        }
    );

    await new Promise<void>((resolve): void => {
        server.listen(0, "127.0.0.1", (): void => resolve());
    });
    const address: AddressInfo = server.address() as AddressInfo;

    return {
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close(): Promise<void> {
            return new Promise((resolve, reject): void => {
                server.close((err): void => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        }
    };
}

function buildTestEnv(urls: EnvConfig["services"]): EnvConfig {
    return {
        port: 3000,
        internalServiceSecret: "test-internal-secret",
        services: urls,
        corsAllowedOrigins: ["http://localhost:5173", "http://localhost:8080"]
    };
}

const USER_1_ID: string = "11111111-1111-4111-8111-111111111111";
const USER_2_ID: string = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID: string = "99999999-9999-4999-8999-999999999999";
const GROUP_ID: string = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSESSMENT_ID: string = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTEST_ID: string = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUBMISSION_ID: string = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOTIFICATION_ID: string = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("api-gateway", (): void => {
    it("serves healthcheck, enforces CORS headers, and blocks internal-only routes with 404", async (): Promise<void> => {
        const dummyUpstream: MockUpstream = await startMockUpstream(() => ({
            status: 200,
            body: {}
        }));

        try {
            const env: EnvConfig = buildTestEnv({
                user: dummyUpstream.url,
                group: dummyUpstream.url,
                assessment: dummyUpstream.url,
                contest: dummyUpstream.url,
                submission: dummyUpstream.url,
                notification: dummyUpstream.url
            });
            const app = createApp({ env });

            const healthRes: Response = await app.request("/health");
            assert.equal(healthRes.status, 200);
            assert.deepEqual(await healthRes.json(), { status: "ok", service: "api-gateway" });

            const corsRes: Response = await app.request("/api/v1/submissions", {
                method: "OPTIONS",
                headers: {
                    Origin: "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Content-Type,Authorization,Idempotency-Key"
                }
            });
            assert.equal(corsRes.status, 204);
            assert.equal(corsRes.headers.get("access-control-allow-origin"), "http://localhost:5173");
            const allowHeaders: string = (
                corsRes.headers.get("access-control-allow-headers") ?? ""
            ).toLowerCase();
            assert.ok(allowHeaders.includes("authorization"));
            assert.ok(allowHeaders.includes("idempotency-key"));

            const blockedRoutes: Array<{ method: string; path: string }> = [
                { method: "POST", path: "/api/v1/auth/verify" },
                { method: "POST", path: "/api/v1/users/batch" },
                { method: "GET", path: `/api/v1/groups/${GROUP_ID}/members/${USER_1_ID}` },
                { method: "GET", path: `/api/v1/assessments/${ASSESSMENT_ID}/summary` },
                { method: "GET", path: `/api/v1/assessments/${ASSESSMENT_ID}/grading-data` },
                { method: "GET", path: `/api/v1/contests/${CONTEST_ID}/submission-context` },
                { method: "POST", path: "/api/v1/internal/notifications" }
            ];

            for (const route of blockedRoutes) {
                const blockedRes: Response = await app.request(route.path, {
                    method: route.method,
                    headers: { Authorization: "Bearer valid-admin-token" }
                });
                assert.equal(blockedRes.status, 404, `Expected 404 for ${route.method} ${route.path}`);
            }
            assert.equal(dummyUpstream.requests.length, 0);
        } finally {
            await dummyUpstream.close();
        }
    });

    it("enforces authentication, strips spoofed internal headers, and validates admin role", async (): Promise<void> => {
        const userUpstream: MockUpstream = await startMockUpstream((req) => {
            if (req.path === "/api/v1/internal/auth/verify") {
                const payload = JSON.parse(req.body.toString("utf8")) as { token: string };
                if (payload.token === "user-token") {
                    return {
                        status: 200,
                        body: {
                            valid: true,
                            user_id: USER_1_ID,
                            user_role: UserSystemRole.USER,
                            status: "ACTIVE"
                        }
                    };
                }
                if (payload.token === "admin-token") {
                    return {
                        status: 200,
                        body: {
                            valid: true,
                            user_id: ADMIN_ID,
                            user_role: UserSystemRole.ADMIN,
                            status: "ACTIVE"
                        }
                    };
                }
                return {
                    status: 401,
                    body: { error_code: "INVALID_TOKEN", message: "Token expired." }
                };
            }
            if (req.path === "/api/v1/internal/auth/logout") {
                return { status: 204 };
            }
            return {
                status: 200,
                body: {
                    path: req.path,
                    x_internal_secret: req.headers["x-internal-secret"],
                    x_user_id: req.headers["x-user-id"] ?? null,
                    x_user_role: req.headers["x-user-role"] ?? null
                }
            };
        });

        try {
            const env: EnvConfig = buildTestEnv({
                user: userUpstream.url,
                group: userUpstream.url,
                assessment: userUpstream.url,
                contest: userUpstream.url,
                submission: userUpstream.url,
                notification: userUpstream.url
            });
            const app = createApp({ env });

            const loginRes: Response = await app.request("/api/v1/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": "spoofed-secret",
                    "X-User-Id": ADMIN_ID,
                    "X-User-Role": "ADMIN"
                },
                body: JSON.stringify({ identifier: "alice", password: "Password123!" })
            });
            assert.equal(loginRes.status, 200);
            const loginData = (await loginRes.json()) as Record<string, unknown>;
            assert.equal(loginData.x_internal_secret, "test-internal-secret");
            assert.equal(loginData.x_user_id, null);
            assert.equal(loginData.x_user_role, null);

            const anonProfileRes: Response = await app.request(`/api/v1/users/${USER_2_ID}`, {
                headers: {
                    "X-User-Id": ADMIN_ID,
                    "X-User-Role": "ADMIN"
                }
            });
            assert.equal(anonProfileRes.status, 200);
            const anonProfile = (await anonProfileRes.json()) as Record<string, unknown>;
            assert.equal(anonProfile.x_user_id, null);
            assert.equal(anonProfile.x_user_role, null);

            const badOptAuthRes: Response = await app.request(`/api/v1/users/${USER_2_ID}`, {
                headers: { Authorization: "Bearer broken-token" }
            });
            assert.equal(badOptAuthRes.status, 401);

            const missingAuthRes: Response = await app.request("/api/v1/users/me");
            assert.equal(missingAuthRes.status, 401);

            const meRes: Response = await app.request("/api/v1/users/me", {
                headers: {
                    Authorization: "Bearer user-token",
                    "X-User-Id": ADMIN_ID,
                    "X-User-Role": "ADMIN"
                }
            });
            assert.equal(meRes.status, 200);
            const meData = (await meRes.json()) as Record<string, unknown>;
            assert.equal(meData.x_user_id, USER_1_ID);
            assert.equal(meData.x_user_role, "USER");

            const logoutRes: Response = await app.request("/api/v1/auth/logout", {
                method: "POST",
                headers: { Authorization: "Bearer user-token" }
            });
            assert.equal(logoutRes.status, 204);
            const logoutReq: RecordedRequest | undefined = userUpstream.requests.find(
                (r): boolean => r.path === "/api/v1/internal/auth/logout"
            );
            assert.ok(logoutReq);
            assert.equal(logoutReq.headers.authorization, "Bearer user-token");

            const userAdminRes: Response = await app.request("/api/v1/admin/users", {
                headers: { Authorization: "Bearer user-token" }
            });
            assert.equal(userAdminRes.status, 403);

            const adminRes: Response = await app.request("/api/v1/admin/users?page=2", {
                headers: { Authorization: "Bearer admin-token" }
            });
            assert.equal(adminRes.status, 200);
            const adminData = (await adminRes.json()) as Record<string, unknown>;
            assert.equal(adminData.x_user_id, ADMIN_ID);
            assert.equal(adminData.x_user_role, "ADMIN");
        } finally {
            await userUpstream.close();
        }
    });

    it("proxies multipart uploads, idempotency headers, 204 responses, delete bodies, and 502 errors", async (): Promise<void> => {
        const binaryPayload: Buffer = Buffer.from("%PDF-1.4\n\x00\xffmock-pdf-bytes\n%%EOF", "binary");
        const gatewayUpstream: MockUpstream = await startMockUpstream((req) => {
            if (req.path === "/api/v1/internal/assessments/pdf") {
                return {
                    status: 201,
                    body: {
                        content_type: req.headers["content-type"],
                        has_pdf_bytes: req.body.includes(binaryPayload)
                    }
                };
            }
            if (req.path === "/api/v1/internal/submissions") {
                return {
                    status: 201,
                    body: {
                        id: SUBMISSION_ID,
                        idempotency_key: req.headers["idempotency-key"]
                    }
                };
            }
            if (req.path === `/notifications/${NOTIFICATION_ID}/read`) {
                assert.equal(req.headers["x-user-id"], USER_1_ID);
                assert.equal(req.headers["x-internal-secret"], undefined);
                return { status: 204 };
            }
            if (req.path === `/api/v1/internal/admin/groups/${GROUP_ID}` && req.method === "DELETE") {
                return {
                    status: 200,
                    body: {
                        deleted_reason: JSON.parse(req.body.toString("utf8")).reason
                    }
                };
            }
            return {
                status: 422,
                body: { error_code: "UNPROCESSABLE", message: "Upstream rejected request." }
            };
        });

        try {
            const env: EnvConfig = buildTestEnv({
                user: gatewayUpstream.url,
                group: gatewayUpstream.url,
                assessment: gatewayUpstream.url,
                contest: gatewayUpstream.url,
                submission: gatewayUpstream.url,
                notification: "http://127.0.0.1:1"
            });
            const verifyToken = async (): Promise<{
                userId: string;
                userRole: UserSystemRole;
                status: string;
            }> => ({
                userId: USER_1_ID,
                userRole: UserSystemRole.ADMIN,
                status: "ACTIVE"
            });

            const multipartApp = createApp({
                env: { ...env, services: { ...env.services, notification: gatewayUpstream.url } },
                verifyToken
            });

            const formData: FormData = new FormData();
            formData.append("title", "Midterm PDF");
            formData.append("group_id", GROUP_ID);
            formData.append(
                "file",
                new Blob([new Uint8Array(binaryPayload)], { type: "application/pdf" }),
                "exam.pdf"
            );

            const pdfRes: Response = await multipartApp.request("/api/v1/assessments/pdf", {
                method: "POST",
                headers: { Authorization: "Bearer ok" },
                body: formData
            });
            assert.equal(pdfRes.status, 201);
            const pdfBody = (await pdfRes.json()) as { content_type: string; has_pdf_bytes: boolean };
            assert.ok(pdfBody.content_type.startsWith("multipart/form-data; boundary="));
            assert.equal(pdfBody.has_pdf_bytes, true);

            const submitRes: Response = await multipartApp.request("/api/v1/submissions", {
                method: "POST",
                headers: {
                    Authorization: "Bearer ok",
                    "Content-Type": "application/json",
                    "Idempotency-Key": "idem-123"
                },
                body: JSON.stringify({ submission_mode: "PRACTICE", answers: [] })
            });
            assert.equal(submitRes.status, 201);
            const submitData = (await submitRes.json()) as { idempotency_key: string };
            assert.equal(submitData.idempotency_key, "idem-123");

            const notifRes: Response = await multipartApp.request(
                `/api/v1/notifications/${NOTIFICATION_ID}/read`,
                {
                    method: "PATCH",
                    headers: { Authorization: "Bearer ok" }
                }
            );
            assert.equal(notifRes.status, 204);

            const deleteRes: Response = await multipartApp.request(
                `/api/v1/admin/groups/${GROUP_ID}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: "Bearer ok",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ reason: "Policy violation" })
                }
            );
            assert.equal(deleteRes.status, 200);
            assert.deepEqual(await deleteRes.json(), { deleted_reason: "Policy violation" });

            const downApp = createApp({ env, verifyToken });
            const downRes: Response = await downApp.request("/api/v1/notifications", {
                headers: { Authorization: "Bearer ok" }
            });
            assert.equal(downRes.status, 502);
        } finally {
            await gatewayUpstream.close();
        }
    });

    it("composes multi-service JSON responses and degrades gracefully when a secondary service fails", async (): Promise<void> => {
        let failSecondary: boolean = false;

        const userMock: MockUpstream = await startMockUpstream((req) => {
            if (req.path === "/api/v1/internal/users/batch") {
                if (failSecondary) {
                    return { status: 500, body: { error_code: "DOWN", message: "failed" } };
                }
                return {
                    status: 200,
                    body: {
                        users: [
                            {
                                id: USER_1_ID,
                                username: "alice",
                                display_name: "Alice Nguyen",
                                avatar_url: null,
                                system_role: UserSystemRole.USER,
                                status: "ACTIVE"
                            },
                            {
                                id: USER_2_ID,
                                username: "bob",
                                display_name: "Bob Tran",
                                avatar_url: null,
                                system_role: UserSystemRole.USER,
                                status: "ACTIVE"
                            }
                        ]
                    }
                };
            }
            return { status: 404, body: {} };
        });

        const groupMock: MockUpstream = await startMockUpstream((req) => {
            if (req.path === `/api/v1/internal/groups/${GROUP_ID}`) {
                if (failSecondary && req.headers["x-user-id"] !== undefined) {
                    return {
                        status: 200,
                        body: {
                            id: GROUP_ID,
                            name: "Algorithms 101",
                            owner_id: USER_1_ID
                        }
                    };
                }
                return {
                    status: 200,
                    body: {
                        id: GROUP_ID,
                        name: "Algorithms 101",
                        owner_id: USER_1_ID
                    }
                };
            }
            if (req.path === `/api/v1/internal/groups/${GROUP_ID}/members`) {
                return {
                    status: 200,
                    body: {
                        items: [
                            { group_id: GROUP_ID, user_id: USER_1_ID, role: "OWNER" },
                            { group_id: GROUP_ID, user_id: USER_2_ID, role: "MEMBER" }
                        ],
                        pagination: { page: 1, limit: 20, total: 2, total_pages: 1 }
                    }
                };
            }
            return { status: 404, body: {} };
        });

        const assessmentMock: MockUpstream = await startMockUpstream((req) => {
            if (req.path === `/api/v1/internal/assessments/${ASSESSMENT_ID}/summary`) {
                if (failSecondary) {
                    return { status: 503, body: { error_code: "DOWN", message: "down" } };
                }
                return {
                    status: 200,
                    body: {
                        id: ASSESSMENT_ID,
                        group_id: GROUP_ID,
                        created_by: USER_1_ID,
                        assessment_type: "HYBRID",
                        version: 2,
                        question_count: 5,
                        total_points: 100
                    }
                };
            }
            return { status: 404, body: {} };
        });

        const contestMock: MockUpstream = await startMockUpstream((req) => {
            if (req.path === `/api/v1/internal/contests/${CONTEST_ID}`) {
                return {
                    status: 200,
                    body: {
                        id: CONTEST_ID,
                        group_id: GROUP_ID,
                        assessment_id: ASSESSMENT_ID,
                        organizer_id: USER_1_ID,
                        title: "Midterm Contest",
                        phase: "ONGOING"
                    }
                };
            }
            if (req.path === `/api/v1/internal/contests/${CONTEST_ID}/participation`) {
                return {
                    status: 200,
                    body: {
                        contest_id: CONTEST_ID,
                        can_participate: true,
                        denial_reason: null
                    }
                };
            }
            return { status: 404, body: {} };
        });

        const submissionMock: MockUpstream = await startMockUpstream((req) => {
            if (req.path === `/api/v1/internal/submissions/${SUBMISSION_ID}`) {
                return {
                    status: 200,
                    body: {
                        id: SUBMISSION_ID,
                        user_id: USER_2_ID,
                        group_id: GROUP_ID,
                        contest_id: CONTEST_ID,
                        assessment_id: ASSESSMENT_ID,
                        grading_status: "GRADED",
                        total_score: 95,
                        answers: [
                            {
                                id: "ans-1",
                                question_id: "q2",
                                grader_id: USER_1_ID
                            }
                        ]
                    }
                };
            }
            return { status: 404, body: {} };
        });

        try {
            const env: EnvConfig = buildTestEnv({
                user: userMock.url,
                group: groupMock.url,
                assessment: assessmentMock.url,
                contest: contestMock.url,
                submission: submissionMock.url,
                notification: userMock.url
            });
            const app = createApp({
                env,
                verifyToken: async (): Promise<{
                    userId: string;
                    userRole: UserSystemRole;
                    status: string;
                }> => ({
                    userId: USER_2_ID,
                    userRole: UserSystemRole.USER,
                    status: "ACTIVE"
                })
            });

            const groupRes: Response = await app.request(`/api/v1/groups/${GROUP_ID}`);
            assert.equal(groupRes.status, 200);
            const groupJson = (await groupRes.json()) as {
                name: string;
                owner: { username: string };
            };
            assert.equal(groupJson.name, "Algorithms 101");
            assert.equal(groupJson.owner.username, "alice");

            const membersRes: Response = await app.request(`/api/v1/groups/${GROUP_ID}/members`);
            assert.equal(membersRes.status, 200);
            const membersJson = (await membersRes.json()) as {
                items: Array<{ user: { username: string } }>;
            };
            assert.equal(membersJson.items[0].user.username, "alice");
            assert.equal(membersJson.items[1].user.username, "bob");

            const contestRes: Response = await app.request(`/api/v1/contests/${CONTEST_ID}`, {
                headers: { Authorization: "Bearer member-token" }
            });
            assert.equal(contestRes.status, 200);
            const contestJson = (await contestRes.json()) as {
                title: string;
                group: { name: string };
                assessment: { total_points: number };
                organizer: { username: string };
                participation: { can_participate: boolean };
            };
            assert.equal(contestJson.title, "Midterm Contest");
            assert.equal(contestJson.group.name, "Algorithms 101");
            assert.equal(contestJson.assessment.total_points, 100);
            assert.equal(contestJson.organizer.username, "alice");
            assert.equal(contestJson.participation.can_participate, true);

            const submissionRes: Response = await app.request(
                `/api/v1/submissions/${SUBMISSION_ID}`,
                {
                    headers: { Authorization: "Bearer member-token" }
                }
            );
            assert.equal(submissionRes.status, 200);
            const submissionJson = (await submissionRes.json()) as {
                total_score: number;
                student: { username: string };
                grader: { username: string };
                group: { name: string };
                assessment: { version: number };
                contest: { title: string };
            };
            assert.equal(submissionJson.total_score, 95);
            assert.equal(submissionJson.student.username, "bob");
            assert.equal(submissionJson.grader.username, "alice");
            assert.equal(submissionJson.group.name, "Algorithms 101");
            assert.equal(submissionJson.assessment.version, 2);
            assert.equal(submissionJson.contest.title, "Midterm Contest");

            failSecondary = true;
            const degradedRes: Response = await app.request(`/api/v1/contests/${CONTEST_ID}`, {
                headers: { Authorization: "Bearer member-token" }
            });
            assert.equal(degradedRes.status, 200);
            const degradedJson = (await degradedRes.json()) as {
                title: string;
                assessment: unknown;
                organizer: unknown;
                group: { name: string };
            };
            assert.equal(degradedJson.title, "Midterm Contest");
            assert.equal(degradedJson.group.name, "Algorithms 101");
            assert.equal(degradedJson.assessment, null);
            assert.equal(degradedJson.organizer, null);
        } finally {
            await Promise.all([
                userMock.close(),
                groupMock.close(),
                assessmentMock.close(),
                contestMock.close(),
                submissionMock.close()
            ]);
        }
    });
});
