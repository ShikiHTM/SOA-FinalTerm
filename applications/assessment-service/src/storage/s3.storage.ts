import { createHash } from "node:crypto";
import {
    CreateBucketCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadBucketCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import {
    assessmentS3OperationDurationSeconds,
    assessmentS3OperationsTotal
} from "../shared/metrics";

async function observeS3Operation<T>(
    operation: string,
    fn: () => Promise<T>
): Promise<T> {
    const startNs: bigint = process.hrtime.bigint();
    let result: "success" | "error" = "success";
    try {
        return await fn();
    } catch (error: unknown) {
        result = "error";
        throw error;
    } finally {
        const durationSeconds: number = Number(process.hrtime.bigint() - startNs) / 1e9;
        assessmentS3OperationDurationSeconds.observe({ operation }, durationSeconds);
        assessmentS3OperationsTotal.inc({ operation, result });
    }
}

export interface PdfValidationResult {
    sha256: string;
    byteLength: number;
}

export interface PresignedUrlResult {
    url: string;
    expiresInSeconds: number;
}

export interface AssessmentStorage {
    ensureBucket(): Promise<void>;
    putJson(key: string, payload: unknown, metadata?: Record<string, string>): Promise<void>;
    putPdf(key: string, buffer: Buffer, metadata?: Record<string, string>): Promise<void>;
    getJson<T>(key: string): Promise<T>;
    getPresignedPdfUrl(key: string, expiresInSeconds?: number): Promise<PresignedUrlResult>;
    deleteObjects(keys: string[]): Promise<void>;
}

const PDF_MAGIC_HEADER: Buffer = Buffer.from("%PDF-", "ascii");

let s3ClientInstance: S3Client | null = null;
let presignClientInstance: S3Client | null = null;

export function buildContentJsonKey(
    groupId: string,
    assessmentId: string,
    version: number
): string {
    return `assessments/${groupId}/${assessmentId}/v${version}/content.json`;
}

export function buildContentPdfKey(
    groupId: string,
    assessmentId: string,
    version: number
): string {
    return `assessments/${groupId}/${assessmentId}/v${version}/content.pdf`;
}

export function buildAnswerKeyObjectKey(
    groupId: string,
    assessmentId: string,
    version: number
): string {
    return `assessments/${groupId}/${assessmentId}/v${version}/answers.json`;
}

export function validatePdfBuffer(buffer: Buffer, maxBytes: number): PdfValidationResult {
    if (buffer.byteLength === 0) {
        throw AppError.badRequest("EMPTY_FILE", "Uploaded PDF file is empty.");
    }
    if (buffer.byteLength > maxBytes) {
        throw AppError.badRequest(
            "FILE_TOO_LARGE",
            `Uploaded PDF file exceeds maximum allowed size of ${maxBytes} bytes.`
        );
    }
    if (
        buffer.byteLength < PDF_MAGIC_HEADER.byteLength ||
        !buffer.subarray(0, PDF_MAGIC_HEADER.byteLength).equals(PDF_MAGIC_HEADER)
    ) {
        throw AppError.badRequest(
            "INVALID_PDF_FILE",
            "Uploaded file is not a valid PDF document."
        );
    }
    const sha256: string = createHash("sha256").update(buffer).digest("hex");
    return {
        sha256,
        byteLength: buffer.byteLength
    };
}

export async function rollbackUploadedObjects(
    storage: AssessmentStorage,
    keys: string[]
): Promise<void> {
    if (keys.length === 0) {
        return;
    }
    try {
        await storage.deleteObjects(keys);
    } catch {
        return;
    }
}

function buildS3ClientConfig(env: EnvConfig, endpointOverride?: string): S3ClientConfig {
    const config: S3ClientConfig = {
        region: env.s3Region
    };
    const resolvedEndpoint: string =
        endpointOverride !== undefined ? endpointOverride : env.s3Endpoint;
    if (resolvedEndpoint.length > 0) {
        config.endpoint = resolvedEndpoint;
    }
    if (env.s3ForcePathStyle) {
        config.forcePathStyle = true;
    }
    if (env.s3AccessKeyId.length > 0 && env.s3SecretAccessKey.length > 0) {
        config.credentials = {
            accessKeyId: env.s3AccessKeyId,
            secretAccessKey: env.s3SecretAccessKey
        };
    }
    return config;
}

function getS3Client(env: EnvConfig): S3Client {
    if (s3ClientInstance === null) {
        s3ClientInstance = new S3Client(buildS3ClientConfig(env));
    }
    return s3ClientInstance;
}

function getPresignClient(env: EnvConfig): S3Client {
    const publicEndpoint: string = env.s3PublicEndpoint || env.s3Endpoint;
    if (publicEndpoint === env.s3Endpoint) {
        return getS3Client(env);
    }
    if (presignClientInstance === null) {
        presignClientInstance = new S3Client(buildS3ClientConfig(env, publicEndpoint));
    }
    return presignClientInstance;
}

function extractS3HttpStatus(error: unknown): number | undefined {
    if (typeof error === "object" && error !== null && "$metadata" in error) {
        const metadata: unknown = (error as { $metadata?: unknown }).$metadata;
        if (typeof metadata === "object" && metadata !== null && "httpStatusCode" in metadata) {
            const status: unknown = (metadata as { httpStatusCode?: unknown }).httpStatusCode;
            if (typeof status === "number") {
                return status;
            }
        }
    }
    return undefined;
}

function extractS3ErrorName(error: unknown): string | undefined {
    if (error instanceof Error) {
        return error.name;
    }
    return undefined;
}

function isNotFoundS3Error(error: unknown): boolean {
    const status: number | undefined = extractS3HttpStatus(error);
    const name: string | undefined = extractS3ErrorName(error);
    return (
        status === 404 ||
        name === "NotFound" ||
        name === "NoSuchBucket" ||
        name === "NoSuchKey"
    );
}

export function closeS3Clients(): void {
    if (s3ClientInstance !== null) {
        s3ClientInstance.destroy();
        s3ClientInstance = null;
    }
    if (presignClientInstance !== null) {
        presignClientInstance.destroy();
        presignClientInstance = null;
    }
}

export function createS3AssessmentStorage(env: EnvConfig): AssessmentStorage {
    return {
        async ensureBucket(): Promise<void> {
            return observeS3Operation("ensure_bucket", async (): Promise<void> => {
                const client: S3Client = getS3Client(env);
                try {
                    await client.send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
                } catch (error: unknown) {
                    if (!isNotFoundS3Error(error)) {
                        throw AppError.badGateway("STORAGE_ERROR", "Unable to verify S3 storage bucket.");
                    }
                    if (!env.s3AutoCreateBucket) {
                        throw AppError.badGateway(
                            "STORAGE_BUCKET_MISSING",
                            "Configured S3 bucket does not exist."
                        );
                    }
                    try {
                        await client.send(new CreateBucketCommand({ Bucket: env.s3Bucket }));
                    } catch {
                        throw AppError.badGateway("STORAGE_ERROR", "Failed to create S3 storage bucket.");
                    }
                }
            });
        },

        async putJson(
            key: string,
            payload: unknown,
            metadata: Record<string, string> = {}
        ): Promise<void> {
            return observeS3Operation("put_json", async (): Promise<void> => {
                const client: S3Client = getS3Client(env);
                const serialized: string = JSON.stringify(payload);
                const bodyBuffer: Buffer = Buffer.from(serialized, "utf8");
                const sha256: string = createHash("sha256").update(bodyBuffer).digest("hex");
                try {
                    await client.send(
                        new PutObjectCommand({
                            Bucket: env.s3Bucket,
                            Key: key,
                            Body: bodyBuffer,
                            ContentType: "application/json; charset=utf-8",
                            CacheControl: "private, no-store",
                            Metadata: {
                                ...metadata,
                                sha256
                            }
                        })
                    );
                } catch {
                    throw AppError.badGateway(
                        "STORAGE_ERROR",
                        "Failed to upload assessment JSON object to S3."
                    );
                }
            });
        },

        async putPdf(
            key: string,
            buffer: Buffer,
            metadata: Record<string, string> = {}
        ): Promise<void> {
            return observeS3Operation("put_pdf", async (): Promise<void> => {
                const client: S3Client = getS3Client(env);
                const sha256: string = createHash("sha256").update(buffer).digest("hex");
                try {
                    await client.send(
                        new PutObjectCommand({
                            Bucket: env.s3Bucket,
                            Key: key,
                            Body: buffer,
                            ContentType: "application/pdf",
                            ContentDisposition: 'inline; filename="assessment.pdf"',
                            CacheControl: "private, no-store",
                            Metadata: {
                                ...metadata,
                                sha256
                            }
                        })
                    );
                } catch {
                    throw AppError.badGateway(
                        "STORAGE_ERROR",
                        "Failed to upload assessment PDF object to S3."
                    );
                }
            });
        },

        async getJson<T>(key: string): Promise<T> {
            return observeS3Operation("get_json", async (): Promise<T> => {
                const client: S3Client = getS3Client(env);
                try {
                    const output = await client.send(
                        new GetObjectCommand({
                            Bucket: env.s3Bucket,
                            Key: key
                        })
                    );
                    if (!output.Body) {
                        throw AppError.notFound(
                            "STORAGE_OBJECT_NOT_FOUND",
                            "Assessment storage object was empty or missing."
                        );
                    }
                    const text: string = await output.Body.transformToString("utf-8");
                    return JSON.parse(text) as T;
                } catch (error: unknown) {
                    if (error instanceof AppError) {
                        throw error;
                    }
                    if (isNotFoundS3Error(error)) {
                        throw AppError.notFound(
                            "STORAGE_OBJECT_NOT_FOUND",
                            "Assessment storage object was not found."
                        );
                    }
                    throw AppError.badGateway(
                        "STORAGE_ERROR",
                        "Failed to retrieve assessment data from S3."
                    );
                }
            });
        },

        async getPresignedPdfUrl(
            key: string,
            expiresInSeconds?: number
        ): Promise<PresignedUrlResult> {
            if (!key.startsWith("assessments/") || !key.endsWith(".pdf")) {
                throw AppError.badRequest(
                    "INVALID_STORAGE_KEY",
                    "Presigned URL generation is only allowed for PDF content objects."
                );
            }
            return observeS3Operation("presign_pdf", async (): Promise<PresignedUrlResult> => {
                const client: S3Client = getPresignClient(env);
                const ttlSeconds: number = expiresInSeconds ?? env.s3PresignExpiresInSeconds;
                try {
                    const url: string = await getSignedUrl(
                        client,
                        new GetObjectCommand({
                            Bucket: env.s3Bucket,
                            Key: key
                        }),
                        { expiresIn: ttlSeconds }
                    );
                    return {
                        url,
                        expiresInSeconds: ttlSeconds
                    };
                } catch {
                    throw AppError.badGateway(
                        "STORAGE_ERROR",
                        "Failed to generate presigned URL for assessment PDF."
                    );
                }
            });
        },

        async deleteObjects(keys: string[]): Promise<void> {
            const uniqueKeys: string[] = Array.from(
                new Set<string>(
                    keys.filter((key: string): boolean => key.trim().length > 0)
                )
            );
            if (uniqueKeys.length === 0) {
                return;
            }
            return observeS3Operation("delete_objects", async (): Promise<void> => {
                const client: S3Client = getS3Client(env);
                try {
                    await client.send(
                        new DeleteObjectsCommand({
                            Bucket: env.s3Bucket,
                            Delete: {
                                Objects: uniqueKeys.map((Key: string): { Key: string } => ({ Key })),
                                Quiet: true
                            }
                        })
                    );
                } catch {
                    throw AppError.badGateway(
                        "STORAGE_ERROR",
                        "Failed to delete assessment objects from S3."
                    );
                }
            });
        }
    };
}
