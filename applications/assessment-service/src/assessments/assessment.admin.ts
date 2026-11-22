import type { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { AssessmentSchema, type AssessmentEntity } from "../db/entities/assessment.entity";
import { AssessmentStatus, type PaginatedResult } from "../shared/types";
import {
    buildPaginationMeta,
    findActiveAssessmentOrThrow,
    toAssessmentMetadata,
    type AssessmentMetadata
} from "./assessment.core";
import type {
    AdminDeleteDto,
    AdminStatusDto,
    ListAssessmentsQuery
} from "./schemas/assessment.schema";

export interface AdminAssessmentRecord extends AssessmentMetadata {
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
}

function toAdminAssessmentRecord(assessment: AssessmentEntity): AdminAssessmentRecord {
    return {
        ...toAssessmentMetadata(assessment),
        moderation_reason: assessment.moderationReason ?? null,
        moderated_by: assessment.moderatedBy ?? null,
        moderated_at: assessment.moderatedAt ? assessment.moderatedAt.toISOString() : null
    };
}

export async function listAssessmentsForAdmin(
    query: ListAssessmentsQuery,
    em: EntityManager
): Promise<PaginatedResult<AdminAssessmentRecord>> {
    const where: FilterQuery<AssessmentEntity> = {
        deletedAt: null
    };
    if (query.group_id !== undefined) {
        where.groupId = query.group_id;
    }
    if (query.status !== undefined) {
        where.status = query.status;
    }
    if (query.visibility !== undefined) {
        where.visibility = query.visibility;
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
        items: assessments.map(toAdminAssessmentRecord),
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function getAssessmentForAdmin(
    assessmentId: string,
    em: EntityManager
): Promise<AdminAssessmentRecord> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    return toAdminAssessmentRecord(assessment);
}

export async function updateAssessmentStatusByAdmin(
    assessmentId: string,
    adminUserId: string,
    payload: AdminStatusDto,
    em: EntityManager
): Promise<AdminAssessmentRecord> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    const now: Date = new Date();
    assessment.status = payload.status;
    assessment.moderationReason =
        payload.status === AssessmentStatus.ACTIVE ? null : (payload.reason ?? null);
    assessment.moderatedBy = adminUserId;
    assessment.moderatedAt = now;
    assessment.updatedAt = now;
    await em.flush();

    return toAdminAssessmentRecord(assessment);
}

export async function deleteAssessmentByAdmin(
    assessmentId: string,
    adminUserId: string,
    payload: AdminDeleteDto,
    em: EntityManager
): Promise<void> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    const now: Date = new Date();
    if (payload.reason !== undefined) {
        assessment.moderationReason = payload.reason;
    }
    assessment.moderatedBy = adminUserId;
    assessment.moderatedAt = now;
    assessment.deletedAt = now;
    assessment.deletedBy = adminUserId;
    assessment.updatedAt = now;
    await em.flush();
}
