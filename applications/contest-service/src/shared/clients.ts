import got, { HTTPError } from "got";
import type { EnvConfig } from "./env";
import { AppError } from "./errors";
import type {
    AssessmentStatus,
    AssessmentVisibility,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility
} from "./types";

export interface GroupMembershipInfo {
    group_id: string;
    user_id: string;
    group_status: GroupStatus;
    visibility: GroupVisibility;
    is_member: boolean;
    is_banned: boolean;
    role: GroupMemberRole | null;
    can_manage: boolean;
    is_owner: boolean;
}

export interface AssessmentSummaryInfo {
    id: string;
    group_id: string;
    created_by: string;
    assessment_type: string;
    version: number;
    question_count: number;
    total_points: number;
    has_essay_items: boolean;
    has_answer_key: boolean;
    is_practice_enabled: boolean;
    visibility: AssessmentVisibility;
    status: AssessmentStatus;
}

export interface ServiceClients {
    getGroupMembership(groupId: string, userId: string): Promise<GroupMembershipInfo>;
    getAssessmentSummary(assessmentId: string): Promise<AssessmentSummaryInfo>;
}

const INTERNAL_REQUEST_TIMEOUT_MS: number = 5000;

async function fetchInternalJson<T>(
    url: string,
    secret: string,
    notFoundCode: string,
    notFoundMessage: string,
    unavailableCode: string,
    unavailableMessage: string
): Promise<T> {
    try {
        return await got
            .get(url, {
                headers: {
                    Accept: "application/json",
                    "X-Internal-Secret": secret
                },
                timeout: {
                    request: INTERNAL_REQUEST_TIMEOUT_MS
                }
            })
            .json<T>();
    } catch (error: unknown) {
        if (error instanceof HTTPError && error.response.statusCode === 404) {
            throw AppError.notFound(notFoundCode, notFoundMessage);
        }
        throw AppError.badGateway(unavailableCode, unavailableMessage);
    }
}

export function createServiceClients(env: EnvConfig): ServiceClients {
    return {
        async getGroupMembership(groupId: string, userId: string): Promise<GroupMembershipInfo> {
            return fetchInternalJson<GroupMembershipInfo>(
                `${env.groupServiceUrl}/api/v1/internal/groups/${groupId}/members/${userId}`,
                env.internalServiceSecret,
                "GROUP_NOT_FOUND",
                "Group not found.",
                "GROUP_SERVICE_UNAVAILABLE",
                "Failed to verify group membership."
            );
        },

        async getAssessmentSummary(assessmentId: string): Promise<AssessmentSummaryInfo> {
            return fetchInternalJson<AssessmentSummaryInfo>(
                `${env.assessmentServiceUrl}/api/v1/internal/assessments/${assessmentId}/summary`,
                env.internalServiceSecret,
                "ASSESSMENT_NOT_FOUND",
                "Assessment not found.",
                "ASSESSMENT_SERVICE_UNAVAILABLE",
                "Failed to verify assessment metadata."
            );
        }
    };
}
