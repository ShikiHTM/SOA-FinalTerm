import type { EntityManager } from "@mikro-orm/postgresql";
import {
    AssessmentFavoriteSchema,
    type AssessmentFavoriteEntity
} from "../db/entities/assessment-favorite.entity";
import type { AssessmentEntity } from "../db/entities/assessment.entity";
import type { GroupAccessClient } from "../shared/group-access";
import { AssessmentStatus, UserSystemRole, type PaginatedResult } from "../shared/types";
import {
    buildPaginationMeta,
    findActiveAssessmentOrThrow,
    requireAssessmentReadAccess,
    toAssessmentMetadata,
    type AssessmentMetadata
} from "./assessment.core";
import type { PaginationQuery } from "./schemas/assessment.schema";

export interface FavoriteAssessmentItem {
    favorited_at: string;
    assessment: AssessmentMetadata;
}

export interface FavoriteActionResponse {
    assessment_id: string;
    favorited: boolean;
}

export async function listFavoriteAssessments(
    userId: string,
    query: PaginationQuery,
    em: EntityManager
): Promise<PaginatedResult<FavoriteAssessmentItem>> {
    const favorites: AssessmentFavoriteEntity[] = await em.find(
        AssessmentFavoriteSchema,
        { userId },
        {
            populate: ["assessment"],
            orderBy: { createdAt: "DESC" }
        }
    );
    const activeFavorites: AssessmentFavoriteEntity[] = favorites.filter(
        (favorite: AssessmentFavoriteEntity): boolean =>
            favorite.assessment.deletedAt === null &&
            favorite.assessment.status === AssessmentStatus.ACTIVE
    );
    const total: number = activeFavorites.length;
    const offset: number = (query.page - 1) * query.limit;
    const pageItems: FavoriteAssessmentItem[] = activeFavorites
        .slice(offset, offset + query.limit)
        .map(
            (favorite: AssessmentFavoriteEntity): FavoriteAssessmentItem => ({
                favorited_at: favorite.createdAt.toISOString(),
                assessment: toAssessmentMetadata(favorite.assessment)
            })
        );

    return {
        items: pageItems,
        pagination: buildPaginationMeta(query.page, query.limit, total)
    };
}

export async function markFavoriteAssessment(
    assessmentId: string,
    userId: string,
    userRole: UserSystemRole,
    groupAccess: GroupAccessClient,
    em: EntityManager
): Promise<FavoriteActionResponse> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    await requireAssessmentReadAccess(assessment, userId, userRole, groupAccess);

    const existing: AssessmentFavoriteEntity | null = await em.findOne(AssessmentFavoriteSchema, {
        userId,
        assessment: assessment.id
    });
    if (existing === null) {
        const favorite: AssessmentFavoriteEntity = em.create(AssessmentFavoriteSchema, {
            userId,
            assessment
        });
        em.persist(favorite);
        await em.flush();
    }

    return {
        assessment_id: assessment.id,
        favorited: true
    };
}

export async function unmarkFavoriteAssessment(
    assessmentId: string,
    userId: string,
    em: EntityManager
): Promise<FavoriteActionResponse> {
    const assessment: AssessmentEntity = await findActiveAssessmentOrThrow(assessmentId, em);
    const existing: AssessmentFavoriteEntity | null = await em.findOne(AssessmentFavoriteSchema, {
        userId,
        assessment: assessment.id
    });
    if (existing !== null) {
        em.remove(existing);
        await em.flush();
    }

    return {
        assessment_id: assessment.id,
        favorited: false
    };
}
