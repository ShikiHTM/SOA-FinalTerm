import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { AssessmentSchema, type AssessmentEntity } from "../db/entities/assessment.entity";
import type { EnvConfig } from "../shared/env";
import { AppError } from "../shared/errors";
import type { GroupAccessClient, GroupMembershipInfo } from "../shared/group-access";
import { formatZodIssues } from "../shared/middleware";
import {
    AssessmentContentFormat,
    AssessmentCreationMode,
    AssessmentStatus,
    AssessmentType,
    AssessmentVisibility,
    GroupStatus,
    GroupVisibility,
    QuestionType,
    UserSystemRole,
    type PaginatedResult,
    type PaginationMeta
} from "../shared/types";
import {
    buildAnswerKeyObjectKey,
    buildContentJsonKey,
    buildContentPdfKey,
    rollbackUploadedObjects,
    validatePdfBuffer,
    type AssessmentStorage,
    type PdfValidationResult,
    type PresignedUrlResult
} from "../storage/s3.storage";
import {
    UpsertAnswerKeySchema,
    type AnswerKeyItem,
    type CreateDigitalAssessmentDto,
    type CreatePdfAssessmentDto,
    type GroupAssessmentsQuery,
    type QuestionInput,
    type QuestionOptionDto,
    type UpdateAssessmentDto,
    type UpsertAnswerKeyDto
} from "./schemas/assessment.schema";

export interface QuestionPublicItem {
    id: string;
    order: number;
    question_type: QuestionType;
    prompt: string;
    points: number;
    options: QuestionOptionDto[] | null;
}

export interface PublicContentDocument {
    assessment_id: string;
    version: number;
    questions: QuestionPublicItem[];
    updated_at: string;
}

export interface AnswerKeyDocument {
    assessment_id: string;
    version: number;
    total_points: number;
    answers: AnswerKeyItem[];
    updated_at: string;
}

export interface AssessmentMetadata {
    id: string;
    group_id: string;
    created_by: string;
    title: string;
    description: string;
    assessment_type: AssessmentType;
    creation_mode: AssessmentCreationMode;
    content_format: AssessmentContentFormat;
    version: number;
    question_count: number;
    total_points: number;
    has_essay_items: boolean;
    has_answer_key: boolean;
    is_practice_enabled: boolean;
    visibility: AssessmentVisibility;
    status: AssessmentStatus;
    created_at: string;
    updated_at: string;
}

export interface AssessmentContentResponse {
    assessment_id: string;
    version: number;
    content_format: AssessmentContentFormat;
    pdf_url: string | null;
    pdf_url_expires_in_seconds: number | null;
    questions: QuestionPublicItem[] | null;
}

export interface InternalAssessmentSummary {
    id: string;
    group_id: string;
    created_by: string;
    assessment_type: AssessmentType;
    version: number;
    question_count: number;
    total_points: number;
    has_essay_items: boolean;
    has_answer_key: boolean;
    is_practice_enabled: boolean;
    visibility: AssessmentVisibility;
    status: AssessmentStatus;
}

export interface InternalGradingDataResponse {
    assessment_id: string;
    group_id: string;
    version: number;
    assessment_type: AssessmentType;
    is_practice_enabled: boolean;
    has_essay: boolean;
    total_points: number;
    answers: AnswerKeyItem[];
}

export function buildPaginationMeta(
    page: number,
    limit: number,
    total: number
): PaginationMeta {
    return {
        page,
        limit,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / limit)
    };
}

export function toAssessmentMetadata(assessment: AssessmentEntity): AssessmentMetadata {
    return {
        id: assessment.id,
        group_id: assessment.groupId,
        created_by: assessment.createdBy,
        title: assessment.title,
        description: assessment.description,
        assessment_type: assessment.assessmentType,
        creation_mode: assessment.creationMode,
        content_format: assessment.contentFormat,
        version: assessment.version,
        question_count: assessment.questionCount,
        total_points: Number(assessment.totalPoints),
        has_essay_items: assessment.hasEssayItems,
        has_answer_key: assessment.answerKeyS3Key !== null,
        is_practice_enabled: assessment.isPracticeEnabled,
        visibility: assessment.visibility,
        status: assessment.status,
        created_at: assessment.createdAt.toISOString(),
        updated_at: assessment.updatedAt.toISOString()
    };
}

export async function findActiveAssessmentOrThrow(
    assessmentId: string,
    em: EntityManager
): Promise<AssessmentEntity> {
    const assessment: AssessmentEntity | null = await em.findOne(AssessmentSchema, {
        id: assessmentId,
        deletedAt: null
    });
    if (assessment === null) {
        throw AppError.notFound("ASSESSMENT_NOT_FOUND", "Assessment not found.");
    }
    return assessment;
}

async function resolveActiveGroupMembership(
    groupId: string,
    actorId: string,
    groupAccess: GroupAccessClient
): Promise<GroupMembershipInfo> {
    const membership: GroupMembershipInfo = await groupAccess.getMembership(groupId, actorId);
    if (membership.group_status !== GroupStatus.ACTIVE) {
        throw AppError.forbidden("GROUP_SUSPENDED", "Owning group is currently suspended.");
    }
    if (membership.is_banned) {
        throw AppError.forbidden("GROUP_ACCESS_DENIED", "You are banned from this group.");
    }
    return membership;
}

async function requireGroupManagerAccess(
    groupId: string,
    actorId: string,
    actorRole: UserSystemRole,
    groupAccess: GroupAccessClient
): Promise<void> {
    if (actorRole === UserSystemRole.ADMIN) {
        return;
    }
    const membership: GroupMembershipInfo = await resolveActiveGroupMembership(
        groupId,
        actorId,
        groupAccess
    );
    if (!membership.can_manage) {
        throw AppError.forbidden(
            "INSUFFICIENT_GROUP_ROLE",
            "Group moderator or owner role is required to manage assessments."
        );
    }
}

export async function requireAssessmentReadAccess(
    assessment: AssessmentEntity,
    actorId: string,
    actorRole: UserSystemRole,
    groupAccess: GroupAccessClient
): Promise<GroupMembershipInfo | null> {
    if (actorRole === UserSystemRole.ADMIN) {
        return null;
    }
    const membership: GroupMembershipInfo = await resolveActiveGroupMembership(
        assessment.groupId,
        actorId,
        groupAccess
    );
    if (assessment.status !== AssessmentStatus.ACTIVE) {
        throw AppError.forbidden("ASSESSMENT_HIDDEN", "This assessment is currently unavailable.");
    }
    if (assessment.visibility === AssessmentVisibility.DRAFT && !membership.can_manage) {
        throw AppError.forbidden(
            "ASSESSMENT_NOT_ACCESSIBLE",
            "Draft assessments are only visible to group managers."
        );
    }
    if (
        (assessment.visibility === AssessmentVisibility.PRIVATE ||
            membership.visibility === GroupVisibility.PRIVATE) &&
        !membership.is_member
    ) {
        throw AppError.forbidden(
            "GROUP_MEMBERSHIP_REQUIRED",
            "Group membership is required to access this assessment."
        );
    }
    return membership;
}

function roundPoints(rawTotal: number): number {
    return Math.round(rawTotal * 100) / 100;
}

function summarizeAnswerItems(items: AnswerKeyItem[]): {
    questionCount: number;
    totalPoints: number;
    hasEssayItems: boolean;
} {
    const rawTotal: number = items.reduce(
        (sum: number, item: AnswerKeyItem): number => sum + item.points,
        0
    );
    const hasEssayItems: boolean = items.some(
        (item: AnswerKeyItem): boolean => item.question_type === QuestionType.ESSAY
    );
    return {
        questionCount: items.length,
        totalPoints: roundPoints(rawTotal),
        hasEssayItems
    };
}

function splitDigitalQuestions(
    assessmentId: string,
    version: number,
    questions: QuestionInput[],
    timestampIso: string
): {
    contentDocument: PublicContentDocument;
    answerKeyDocument: AnswerKeyDocument;
    questionCount: number;
    totalPoints: number;
    hasEssayItems: boolean;
} {
    const sortedQuestions: QuestionInput[] = [...questions].sort(
        (left: QuestionInput, right: QuestionInput): number => left.order - right.order
    );
    const publicQuestions: QuestionPublicItem[] = sortedQuestions.map(
        (item: QuestionInput): QuestionPublicItem => ({
            id: item.id,
            order: item.order,
            question_type: item.question_type,
            prompt: item.prompt,
            points: item.points,
            options: item.options ?? null
        })
    );
    const answerItems: AnswerKeyItem[] = sortedQuestions.map(
        (item: QuestionInput): AnswerKeyItem => ({
            question_id: item.id,
            question_type: item.question_type,
            points: item.points,
            correct_answer: item.correct_answer ?? null,
            grading_rubric: item.grading_rubric ?? null
        })
    );
    const summary = summarizeAnswerItems(answerItems);

    return {
        contentDocument: {
            assessment_id: assessmentId,
            version,
            questions: publicQuestions,
            updated_at: timestampIso
        },
        answerKeyDocument: {
            assessment_id: assessmentId,
            version,
            total_points: summary.totalPoints,
            answers: answerItems,
            updated_at: timestampIso
        },
        ...summary
    };
}

function parseAnswersFormField(rawAnswers: string | undefined): AnswerKeyItem[] | null {
    if (rawAnswers === undefined || rawAnswers.trim().length === 0) {
        return null;
    }
    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(rawAnswers);
    } catch {
        throw AppError.badRequest("VALIDATION_ERROR", "Malformed JSON in answers form field.");
    }
    const candidatePayload: unknown = Array.isArray(parsedJson)
        ? { answers: parsedJson }
        : parsedJson;
    const validationResult = UpsertAnswerKeySchema.safeParse(candidatePayload);
    if (!validationResult.success) {
        throw AppError.badRequest(
            "VALIDATION_ERROR",
            "Request validation failed.",
            formatZodIssues(validationResult.error.issues)
        );
    }
    return validationResult.data.answers;
}

export async function listGroupAssessments(
    query: GroupAssessmentsQuery,
    actorId: string,
    actorRole: UserSystemRole,
    groupAccess: GroupAccessClient,
    em: EntityManager
): Promise<PaginatedResult<AssessmentMetadata>> {
    let canManageGroup: boolean = actorRole === UserSystemRole.ADMIN;
    let isGroupMember: boolean = actorRole === UserSystemRole.ADMIN;
    if (actorRole !== UserSystemRole.ADMIN) {
        const membership: GroupMembershipInfo = await resolveActiveGroupMembership(
            query.group_id,
            actorId,
            groupAccess
        );
        canManageGroup = membership.can_manage;
        isGroupMember = membership.is_member;
        if (membership.visibility === GroupVisibility.PRIVATE && !isGroupMember) {
            throw AppError.forbidden(
                "GROUP_MEMBERSHIP_REQUIRED",
                "Group membership is required to view assessments in a private group."
            );
        }
    }

    const where: FilterQuery<AssessmentEntity> = {
        groupId: query.group_id,
        deletedAt: null,
        status: AssessmentStatus.ACTIVE
    };
    if (!canManageGroup) {
        if (query.visibility === AssessmentVisibility.DRAFT) {
            return {
                items: [],
                pagination: buildPaginationMeta(query.page, query.limit, 0)
            };
        }
        if (query.visibility !== undefined) {
            if (query.visibility === AssessmentVisibility.PRIVATE && !isGroupMember) {
                throw AppError.forbidden(
                    "GROUP_MEMBERSHIP_REQUIRED",
                    "Group membership is required to view private assessments."
                );
            }
            where.visibility = query.visibility;
        } else {
            where.visibility = isGroupMember
                ? { $in: [AssessmentVisibility.PUBLIC, AssessmentVisibility.PRIVATE] }
                : AssessmentVisibility.PUBLIC;
        }
    } else if (query.visibility !== undefined) {
        where.visibility = query.visibility;
    }

    if (query.is_practice_enabled !== undefined) {
        where.isPracticeEnabled = query.is_practice_enabled;
    }
    if (query.search !== undefined && query.search.length > 0) {
        const pattern: string = `%${query.search}%`;
        where.$or = [{ title: { $ilike: pattern } }, { description: { $ilike: pattern } }];
    }

    const offset: number = (query.page - 1) * query.limit;
    const [assessments, total]: [AssessmentEntity[], number] = await em.findAndCount(
        AssessmentSchema,
        where,
        {
            orderBy: { createdAt: "DESC" },
            limit: query.limit,
            offset
        }
    );

    return {
        items: assessments.map(toAssessmentMetadata),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function getAssessmentById(
    assessmentId: string,
    actorId: string,
    actorRole: UserSystemRole,
    groupAccess: GroupAccessClient,
    em: EntityManager
): Promise<AssessmentMetadata> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    await requireAssessmentReadAccess(assessment, actorId, actorRole, groupAccess);
    return toAssessmentMetadata(assessment);
}

export async function createDigitalAssessment(
    actorId: string,
    actorRole: UserSystemRole,
    payload: CreateDigitalAssessmentDto,
    groupAccess: GroupAccessClient,
    storage: AssessmentStorage,
    em: EntityManager
): Promise<AssessmentMetadata> {
    await requireGroupManagerAccess(payload.group_id, actorId, actorRole, groupAccess);

    const assessmentId: string = v4();
    const version: number = 1;
    const now: Date = new Date();
    const contentKey: string = buildContentJsonKey(payload.group_id, assessmentId, version);
    const answerKeyKey: string = buildAnswerKeyObjectKey(payload.group_id, assessmentId, version);
    const split = splitDigitalQuestions(
        assessmentId,
        version,
        payload.questions,
        now.toISOString()
    );

    const uploadedKeys: string[] = [];
    await storage.putJson(contentKey, split.contentDocument, {
        assessment_id: assessmentId,
        version: String(version)
    });
    uploadedKeys.push(contentKey);

    try {
        await storage.putJson(answerKeyKey, split.answerKeyDocument, {
            assessment_id: assessmentId,
            version: String(version)
        });
        uploadedKeys.push(answerKeyKey);

        const assessment: AssessmentEntity = em.create(AssessmentSchema, {
            id: assessmentId,
            groupId: payload.group_id,
            createdBy: actorId,
            title: payload.title,
            description: payload.description,
            assessmentType: payload.assessment_type,
            creationMode: AssessmentCreationMode.DIRECT,
            contentFormat: AssessmentContentFormat.JSON,
            contentS3Key: contentKey,
            answerKeyS3Key: answerKeyKey,
            version,
            questionCount: split.questionCount,
            totalPoints: split.totalPoints,
            hasEssayItems: split.hasEssayItems,
            isPracticeEnabled: payload.is_practice_enabled,
            visibility: payload.visibility,
            status: AssessmentStatus.ACTIVE
        });
        em.persist(assessment);
        await em.flush();
        return toAssessmentMetadata(assessment);
    } catch (error: unknown) {
        await rollbackUploadedObjects(storage, uploadedKeys);
        throw error;
    }
}

export async function createPdfAssessment(
    actorId: string,
    actorRole: UserSystemRole,
    formFields: CreatePdfAssessmentDto,
    pdfBuffer: Buffer,
    env: EnvConfig,
    groupAccess: GroupAccessClient,
    storage: AssessmentStorage,
    em: EntityManager
): Promise<AssessmentMetadata> {
    await requireGroupManagerAccess(formFields.group_id, actorId, actorRole, groupAccess);

    const parsedAnswers: AnswerKeyItem[] | null = parseAnswersFormField(formFields.answers);
    const pdfValidation: PdfValidationResult = validatePdfBuffer(pdfBuffer, env.s3MaxPdfBytes);

    const assessmentId: string = v4();
    const version: number = 1;
    const now: Date = new Date();
    const contentKey: string = buildContentPdfKey(formFields.group_id, assessmentId, version);
    const uploadedKeys: string[] = [];

    await storage.putPdf(contentKey, pdfBuffer, {
        assessment_id: assessmentId,
        version: String(version),
        content_sha256: pdfValidation.sha256
    });
    uploadedKeys.push(contentKey);

    try {
        let answerKeyKey: string | null = null;
        let questionCount: number = 0;
        let totalPoints: number = 0;
        let hasEssayItems: boolean = formFields.assessment_type === AssessmentType.ESSAY;

        if (parsedAnswers !== null) {
            const summary = summarizeAnswerItems(parsedAnswers);
            questionCount = summary.questionCount;
            totalPoints = summary.totalPoints;
            hasEssayItems = summary.hasEssayItems;
            answerKeyKey = buildAnswerKeyObjectKey(formFields.group_id, assessmentId, version);
            const answerKeyDocument: AnswerKeyDocument = {
                assessment_id: assessmentId,
                version,
                total_points: summary.totalPoints,
                answers: parsedAnswers,
                updated_at: now.toISOString()
            };
            await storage.putJson(answerKeyKey, answerKeyDocument, {
                assessment_id: assessmentId,
                version: String(version)
            });
            uploadedKeys.push(answerKeyKey);
        }

        const assessment: AssessmentEntity = em.create(AssessmentSchema, {
            id: assessmentId,
            groupId: formFields.group_id,
            createdBy: actorId,
            title: formFields.title,
            description: formFields.description,
            assessmentType: formFields.assessment_type,
            creationMode: AssessmentCreationMode.PDF_IMPORT,
            contentFormat: AssessmentContentFormat.PDF,
            contentS3Key: contentKey,
            answerKeyS3Key: answerKeyKey,
            version,
            questionCount,
            totalPoints,
            hasEssayItems,
            isPracticeEnabled: formFields.is_practice_enabled,
            visibility: formFields.visibility,
            status: AssessmentStatus.ACTIVE
        });
        em.persist(assessment);
        await em.flush();
        return toAssessmentMetadata(assessment);
    } catch (error: unknown) {
        await rollbackUploadedObjects(storage, uploadedKeys);
        throw error;
    }
}

function applyMetadataUpdates(
    assessment: AssessmentEntity,
    payload: UpdateAssessmentDto
): void {
    if (payload.title !== undefined) {
        assessment.title = payload.title;
    }
    if (payload.description !== undefined) {
        assessment.description = payload.description;
    }
    if (payload.assessment_type !== undefined) {
        assessment.assessmentType = payload.assessment_type;
    }
    if (payload.visibility !== undefined) {
        assessment.visibility = payload.visibility;
    }
    if (payload.is_practice_enabled !== undefined) {
        assessment.isPracticeEnabled = payload.is_practice_enabled;
    }
}

export async function updateAssessment(
    assessmentId: string,
    actorId: string,
    actorRole: UserSystemRole,
    payload: UpdateAssessmentDto,
    pdfBuffer: Buffer | null,
    env: EnvConfig,
    groupAccess: GroupAccessClient,
    storage: AssessmentStorage,
    em: EntityManager
): Promise<AssessmentMetadata> {
    const hasMetadataUpdate: boolean =
        payload.title !== undefined ||
        payload.description !== undefined ||
        payload.assessment_type !== undefined ||
        payload.visibility !== undefined ||
        payload.is_practice_enabled !== undefined;

    if (!hasMetadataUpdate && payload.questions === undefined && pdfBuffer === null) {
        throw AppError.badRequest(
            "VALIDATION_ERROR",
            "At least one field or replacement PDF file must be provided for update."
        );
    }

    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    await requireGroupManagerAccess(assessment.groupId, actorId, actorRole, groupAccess);

    if (
        payload.questions !== undefined &&
        assessment.contentFormat !== AssessmentContentFormat.JSON
    ) {
        throw AppError.badRequest(
            "CONTENT_FORMAT_MISMATCH",
            "Structured JSON questions can only be updated on digital assessments."
        );
    }
    if (pdfBuffer !== null && assessment.contentFormat !== AssessmentContentFormat.PDF) {
        throw AppError.badRequest(
            "CONTENT_FORMAT_MISMATCH",
            "PDF files can only be replaced on PDF assessments."
        );
    }

    const now: Date = new Date();
    const uploadedKeys: string[] = [];

    if (payload.questions !== undefined) {
        const nextVersion: number = assessment.version + 1;
        const contentKey: string = buildContentJsonKey(
            assessment.groupId,
            assessment.id,
            nextVersion
        );
        const answerKeyKey: string = buildAnswerKeyObjectKey(
            assessment.groupId,
            assessment.id,
            nextVersion
        );
        const split = splitDigitalQuestions(
            assessment.id,
            nextVersion,
            payload.questions,
            now.toISOString()
        );
        await storage.putJson(contentKey, split.contentDocument, {
            assessment_id: assessment.id,
            version: String(nextVersion)
        });
        uploadedKeys.push(contentKey);
        try {
            await storage.putJson(answerKeyKey, split.answerKeyDocument, {
                assessment_id: assessment.id,
                version: String(nextVersion)
            });
            uploadedKeys.push(answerKeyKey);
        } catch (error: unknown) {
            await rollbackUploadedObjects(storage, uploadedKeys);
            throw error;
        }
        assessment.version = nextVersion;
        assessment.contentS3Key = contentKey;
        assessment.answerKeyS3Key = answerKeyKey;
        assessment.questionCount = split.questionCount;
        assessment.totalPoints = split.totalPoints;
        assessment.hasEssayItems = split.hasEssayItems;
    } else if (pdfBuffer !== null) {
        const pdfValidation: PdfValidationResult = validatePdfBuffer(
            pdfBuffer,
            env.s3MaxPdfBytes
        );
        const nextVersion: number = assessment.version + 1;
        const contentKey: string = buildContentPdfKey(
            assessment.groupId,
            assessment.id,
            nextVersion
        );
        await storage.putPdf(contentKey, pdfBuffer, {
            assessment_id: assessment.id,
            version: String(nextVersion),
            content_sha256: pdfValidation.sha256
        });
        uploadedKeys.push(contentKey);
        assessment.version = nextVersion;
        assessment.contentS3Key = contentKey;
    }

    applyMetadataUpdates(assessment, payload);
    assessment.updatedAt = now;

    try {
        await em.flush();
        return toAssessmentMetadata(assessment);
    } catch (error: unknown) {
        await rollbackUploadedObjects(storage, uploadedKeys);
        throw error;
    }
}

export async function deleteAssessment(
    assessmentId: string,
    actorId: string,
    actorRole: UserSystemRole,
    groupAccess: GroupAccessClient,
    em: EntityManager
): Promise<void> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    await requireGroupManagerAccess(assessment.groupId, actorId, actorRole, groupAccess);

    const now: Date = new Date();
    assessment.deletedAt = now;
    assessment.deletedBy = actorId;
    assessment.updatedAt = now;
    await em.flush();
}

export async function getPublicAssessmentContent(
    assessmentId: string,
    actorId: string,
    actorRole: UserSystemRole,
    groupAccess: GroupAccessClient,
    storage: AssessmentStorage,
    em: EntityManager
): Promise<AssessmentContentResponse> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    await requireAssessmentReadAccess(assessment, actorId, actorRole, groupAccess);

    if (assessment.contentFormat === AssessmentContentFormat.PDF) {
        const presigned: PresignedUrlResult = await storage.getPresignedPdfUrl(
            assessment.contentS3Key
        );
        return {
            assessment_id: assessment.id,
            version: assessment.version,
            content_format: AssessmentContentFormat.PDF,
            pdf_url: presigned.url,
            pdf_url_expires_in_seconds: presigned.expiresInSeconds,
            questions: null
        };
    }

    const contentDoc: PublicContentDocument = await storage.getJson<PublicContentDocument>(
        assessment.contentS3Key
    );
    return {
        assessment_id: assessment.id,
        version: assessment.version,
        content_format: AssessmentContentFormat.JSON,
        pdf_url: null,
        pdf_url_expires_in_seconds: null,
        questions: contentDoc.questions
    };
}

export async function getAssessmentAnswerKey(
    assessmentId: string,
    actorId: string,
    actorRole: UserSystemRole,
    groupAccess: GroupAccessClient,
    storage: AssessmentStorage,
    em: EntityManager
): Promise<AnswerKeyDocument> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    await requireGroupManagerAccess(assessment.groupId, actorId, actorRole, groupAccess);

    if (assessment.answerKeyS3Key === null) {
        throw AppError.notFound(
            "ANSWER_KEY_NOT_FOUND",
            "Answer key has not been mapped for this assessment."
        );
    }
    return storage.getJson<AnswerKeyDocument>(assessment.answerKeyS3Key);
}

export async function upsertAssessmentAnswerKey(
    assessmentId: string,
    actorId: string,
    actorRole: UserSystemRole,
    payload: UpsertAnswerKeyDto,
    groupAccess: GroupAccessClient,
    storage: AssessmentStorage,
    em: EntityManager
): Promise<AnswerKeyDocument> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    await requireGroupManagerAccess(assessment.groupId, actorId, actorRole, groupAccess);

    const now: Date = new Date();
    const nextVersion: number = assessment.version + 1;
    const summary = summarizeAnswerItems(payload.answers);
    const answerKeyKey: string = buildAnswerKeyObjectKey(
        assessment.groupId,
        assessment.id,
        nextVersion
    );
    const answerKeyDocument: AnswerKeyDocument = {
        assessment_id: assessment.id,
        version: nextVersion,
        total_points: summary.totalPoints,
        answers: payload.answers,
        updated_at: now.toISOString()
    };

    await storage.putJson(answerKeyKey, answerKeyDocument, {
        assessment_id: assessment.id,
        version: String(nextVersion)
    });

    try {
        assessment.version = nextVersion;
        assessment.answerKeyS3Key = answerKeyKey;
        assessment.questionCount = summary.questionCount;
        assessment.totalPoints = summary.totalPoints;
        assessment.hasEssayItems = summary.hasEssayItems;
        assessment.updatedAt = now;
        await em.flush();
        return answerKeyDocument;
    } catch (error: unknown) {
        await rollbackUploadedObjects(storage, [answerKeyKey]);
        throw error;
    }
}

export async function getInternalAssessmentSummary(
    assessmentId: string,
    em: EntityManager
): Promise<InternalAssessmentSummary> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    return {
        id: assessment.id,
        group_id: assessment.groupId,
        created_by: assessment.createdBy,
        assessment_type: assessment.assessmentType,
        version: assessment.version,
        question_count: assessment.questionCount,
        total_points: Number(assessment.totalPoints),
        has_essay_items: assessment.hasEssayItems,
        has_answer_key: assessment.answerKeyS3Key !== null,
        is_practice_enabled: assessment.isPracticeEnabled,
        visibility: assessment.visibility,
        status: assessment.status
    };
}

export async function getInternalGradingData(
    assessmentId: string,
    requestedVersion: number | undefined,
    storage: AssessmentStorage,
    em: EntityManager
): Promise<InternalGradingDataResponse> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    let targetKey: string | null = assessment.answerKeyS3Key;
    if (requestedVersion !== undefined) {
        targetKey = buildAnswerKeyObjectKey(assessment.groupId, assessment.id, requestedVersion);
    }
    if (targetKey === null) {
        throw AppError.notFound(
            "ANSWER_KEY_NOT_FOUND",
            "Answer key has not been mapped for this assessment."
        );
    }

    const answerKeyDoc: AnswerKeyDocument = await storage.getJson<AnswerKeyDocument>(targetKey);
    const hasEssay: boolean =
        assessment.hasEssayItems ||
        answerKeyDoc.answers.some(
            (item: AnswerKeyItem): boolean => item.question_type === QuestionType.ESSAY
        );

    return {
        assessment_id: assessment.id,
        group_id: assessment.groupId,
        version: answerKeyDoc.version,
        assessment_type: assessment.assessmentType,
        is_practice_enabled: assessment.isPracticeEnabled,
        has_essay: hasEssay,
        total_points: answerKeyDoc.total_points,
        answers: answerKeyDoc.answers
    };
}
