import type { KyInstance } from "ky";
import { createApiClient } from "../data/http/httpClient";
import type {
    AdminAssessmentRecord,
    AdminContestRecord,
    AdminGroupRecord,
    AdminUserRecord,
    AnswerKeyDocument,
    AnswerKeyItem,
    AssessmentContentResponse,
    AssessmentMetadata,
    AssessmentStatus,
    AssessmentType,
    AssessmentVisibility,
    AuthResponse,
    ContestParticipationInfo,
    ContestPhase,
    ContestStatus,
    ContestSubmissionPolicy,
    ContestSummary,
    ContestVisibility,
    FavoriteAssessmentItem,
    FollowActionResponse,
    GroupBanRecord,
    GroupJoinPolicy,
    GroupMemberRecord,
    GroupMemberRole,
    GroupStatus,
    GroupSummary,
    GroupVisibility,
    JoinRequestRecord,
    JoinRequestStatus,
    ManualGradeItem,
    NotificationItem,
    OAuthProvider,
    OwnUserProfile,
    PaginatedResult,
    PrivacySettings,
    PublicUserProfile,
    QuestionInput,
    SubmissionGradingStatus,
    SubmissionMode,
    SubmissionRecord,
    SubmissionTriggerType,
    SubmittedAnswerInput,
    UserFollowItem,
    UserStatus,
    UserSystemRole
} from "./types";

const ACCESS_TOKEN_KEY: string = "lms-access-token";

function resolveApiBaseUrl(): string {
    if (typeof window !== "undefined") {
        const runtimeConfig: unknown = (
            window as Window & { __APP_CONFIG__?: { VITE_API_BASE_URL?: unknown } }
        ).__APP_CONFIG__;
        if (typeof runtimeConfig === "object" && runtimeConfig !== null) {
            const rawRuntime: unknown = (runtimeConfig as { VITE_API_BASE_URL?: unknown })
                .VITE_API_BASE_URL;
            if (typeof rawRuntime === "string" && rawRuntime.trim().length > 0) {
                return rawRuntime.trim();
            }
        }
    }
    const raw: unknown = import.meta.env.VITE_API_BASE_URL;
    if (typeof raw === "string" && raw.trim().length > 0) {
        return raw.trim();
    }
    if (typeof window !== "undefined") {
        return "/api/v1";
    }
    return "http://localhost:3000/api/v1";
}

export function getAccessToken(): string {
    try {
        return localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
    } catch {
        return "";
    }
}

export function setAccessToken(token: string): void {
    try {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {
        return;
    }
}

export function clearAccessToken(): void {
    try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
        return;
    }
}

const api: KyInstance = createApiClient({
    prefix: resolveApiBaseUrl(),
    getAccessToken
});

function cleanSearchParams(
    params: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> {
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

export const authApi = {
    login(identifier: string, password: string): Promise<AuthResponse> {
        return api.post("auth/login", { json: { identifier, password } }).json<AuthResponse>();
    },

    register(payload: {
        email: string;
        username: string;
        password: string;
        display_name: string;
    }): Promise<AuthResponse> {
        return api.post("auth/register", { json: payload }).json<AuthResponse>();
    },

    oauthLogin(payload: {
        provider: OAuthProvider;
        code: string;
        redirect_uri: string;
    }): Promise<AuthResponse> {
        return api.post("auth/oauth", { json: payload }).json<AuthResponse>();
    },

    async logout(): Promise<void> {
        await api.post("auth/logout");
    }
};

export const usersApi = {
    getMe(): Promise<OwnUserProfile> {
        return api.get("users/me").json<OwnUserProfile>();
    },

    updateMe(payload: {
        display_name?: string;
        username?: string;
        bio?: string | null;
        avatar_url?: string | null;
        privacy_settings?: Partial<PrivacySettings>;
    }): Promise<OwnUserProfile> {
        return api.patch("users/me", { json: payload }).json<OwnUserProfile>();
    },

    async changePassword(current_password: string, new_password: string): Promise<void> {
        await api.put("users/me/password", { json: { current_password, new_password } });
    },

    getByUsername(username: string): Promise<PublicUserProfile> {
        return api.get(`users/username/${encodeURIComponent(username)}`).json<PublicUserProfile>();
    },

    getById(id: string): Promise<PublicUserProfile> {
        return api.get(`users/${encodeURIComponent(id)}`).json<PublicUserProfile>();
    },

    follow(id: string): Promise<FollowActionResponse> {
        return api.post(`users/${encodeURIComponent(id)}/follow`).json<FollowActionResponse>();
    },

    unfollow(id: string): Promise<FollowActionResponse> {
        return api.delete(`users/${encodeURIComponent(id)}/follow`).json<FollowActionResponse>();
    },

    listFollowers(
        id: string,
        query: { page?: number; limit?: number } = {}
    ): Promise<PaginatedResult<UserFollowItem>> {
        return api
            .get(`users/${encodeURIComponent(id)}/followers`, {
                searchParams: cleanSearchParams(query)
            })
            .json<PaginatedResult<UserFollowItem>>();
    },

    listFollowing(
        id: string,
        query: { page?: number; limit?: number } = {}
    ): Promise<PaginatedResult<UserFollowItem>> {
        return api
            .get(`users/${encodeURIComponent(id)}/following`, {
                searchParams: cleanSearchParams(query)
            })
            .json<PaginatedResult<UserFollowItem>>();
    }
};

export const groupsApi = {
    list(
        query: {
            page?: number;
            limit?: number;
            search?: string;
            visibility?: GroupVisibility;
        } = {}
    ): Promise<PaginatedResult<GroupSummary>> {
        return api
            .get("groups", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<GroupSummary>>();
    },

    listMine(query: { page?: number; limit?: number } = {}): Promise<PaginatedResult<GroupSummary>> {
        return api
            .get("groups/me", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<GroupSummary>>();
    },

    getById(id: string): Promise<GroupSummary> {
        return api.get(`groups/${encodeURIComponent(id)}`).json<GroupSummary>();
    },

    getByCode(code: string): Promise<GroupSummary> {
        return api.get(`groups/code/${encodeURIComponent(code)}`).json<GroupSummary>();
    },

    create(payload: {
        name: string;
        description: string;
        visibility: GroupVisibility;
        join_policy: GroupJoinPolicy;
        password?: string;
    }): Promise<GroupSummary> {
        return api.post("groups", { json: payload }).json<GroupSummary>();
    },

    update(
        id: string,
        payload: {
            name?: string;
            description?: string;
            visibility?: GroupVisibility;
            join_policy?: GroupJoinPolicy;
            password?: string;
        }
    ): Promise<GroupSummary> {
        return api.patch(`groups/${encodeURIComponent(id)}`, { json: payload }).json<GroupSummary>();
    },

    async delete(id: string): Promise<void> {
        await api.delete(`groups/${encodeURIComponent(id)}`);
    },

    transferOwnership(id: string, new_owner_id: string): Promise<GroupSummary> {
        return api
            .post(`groups/${encodeURIComponent(id)}/transfer-ownership`, {
                json: { new_owner_id }
            })
            .json<GroupSummary>();
    },

    join(id: string, password?: string): Promise<GroupMemberRecord> {
        return api
            .post(`groups/${encodeURIComponent(id)}/join`, {
                json: password ? { password } : {}
            })
            .json<GroupMemberRecord>();
    },

    async leave(id: string): Promise<void> {
        await api.post(`groups/${encodeURIComponent(id)}/leave`);
    },

    requestJoin(id: string): Promise<JoinRequestRecord> {
        return api.post(`groups/${encodeURIComponent(id)}/requests`).json<JoinRequestRecord>();
    },

    listRequests(
        id: string,
        query: { page?: number; limit?: number; status?: JoinRequestStatus } = {}
    ): Promise<PaginatedResult<JoinRequestRecord>> {
        return api
            .get(`groups/${encodeURIComponent(id)}/requests`, {
                searchParams: cleanSearchParams(query)
            })
            .json<PaginatedResult<JoinRequestRecord>>();
    },

    reviewRequest(
        groupId: string,
        requestId: string,
        decision: "APPROVED" | "REJECTED"
    ): Promise<JoinRequestRecord> {
        return api
            .patch(
                `groups/${encodeURIComponent(groupId)}/requests/${encodeURIComponent(requestId)}`,
                { json: { decision } }
            )
            .json<JoinRequestRecord>();
    },

    listMembers(
        id: string,
        query: { page?: number; limit?: number; role?: GroupMemberRole } = {}
    ): Promise<PaginatedResult<GroupMemberRecord>> {
        return api
            .get(`groups/${encodeURIComponent(id)}/members`, {
                searchParams: cleanSearchParams(query)
            })
            .json<PaginatedResult<GroupMemberRecord>>();
    },

    updateMemberRole(
        groupId: string,
        userId: string,
        role: "MEMBER" | "MODERATOR"
    ): Promise<GroupMemberRecord> {
        return api
            .patch(
                `groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/role`,
                { json: { role } }
            )
            .json<GroupMemberRecord>();
    },

    async removeMember(groupId: string, userId: string): Promise<void> {
        await api.delete(
            `groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`
        );
    },

    listBans(
        groupId: string,
        query: { page?: number; limit?: number } = {}
    ): Promise<PaginatedResult<GroupBanRecord>> {
        return api
            .get(`groups/${encodeURIComponent(groupId)}/bans`, {
                searchParams: cleanSearchParams(query)
            })
            .json<PaginatedResult<GroupBanRecord>>();
    },

    banUser(groupId: string, user_id: string, reason?: string): Promise<GroupBanRecord> {
        return api
            .post(`groups/${encodeURIComponent(groupId)}/bans`, {
                json: reason ? { user_id, reason } : { user_id }
            })
            .json<GroupBanRecord>();
    },

    async unbanUser(groupId: string, userId: string): Promise<void> {
        await api.delete(
            `groups/${encodeURIComponent(groupId)}/bans/${encodeURIComponent(userId)}`
        );
    }
};

export const assessmentsApi = {
    listByGroup(query: {
        group_id: string;
        page?: number;
        limit?: number;
        visibility?: AssessmentVisibility;
        is_practice_enabled?: boolean;
        search?: string;
    }): Promise<PaginatedResult<AssessmentMetadata>> {
        return api
            .get("assessments", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<AssessmentMetadata>>();
    },

    createDigital(payload: {
        group_id: string;
        title: string;
        description: string;
        assessment_type: AssessmentType;
        visibility: AssessmentVisibility;
        is_practice_enabled: boolean;
        questions: QuestionInput[];
    }): Promise<AssessmentMetadata> {
        return api.post("assessments", { json: payload }).json<AssessmentMetadata>();
    },

    createPdf(payload: {
        group_id: string;
        title: string;
        description: string;
        assessment_type: AssessmentType;
        visibility: AssessmentVisibility;
        is_practice_enabled: boolean;
        file: File;
        answers?: AnswerKeyItem[];
    }): Promise<AssessmentMetadata> {
        const formData: FormData = new FormData();
        formData.append("group_id", payload.group_id);
        formData.append("title", payload.title);
        formData.append("description", payload.description);
        formData.append("assessment_type", payload.assessment_type);
        formData.append("visibility", payload.visibility);
        formData.append("is_practice_enabled", String(payload.is_practice_enabled));
        formData.append("file", payload.file);
        if (payload.answers && payload.answers.length > 0) {
            formData.append("answers", JSON.stringify(payload.answers));
        }
        return api.post("assessments/pdf", { body: formData }).json<AssessmentMetadata>();
    },

    listFavorites(
        query: { page?: number; limit?: number } = {}
    ): Promise<PaginatedResult<FavoriteAssessmentItem>> {
        return api
            .get("assessments/favorites", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<FavoriteAssessmentItem>>();
    },

    getById(id: string): Promise<AssessmentMetadata> {
        return api.get(`assessments/${encodeURIComponent(id)}`).json<AssessmentMetadata>();
    },

    updateDigital(
        id: string,
        payload: {
            title?: string;
            description?: string;
            assessment_type?: AssessmentType;
            visibility?: AssessmentVisibility;
            is_practice_enabled?: boolean;
            questions?: QuestionInput[];
        }
    ): Promise<AssessmentMetadata> {
        return api
            .put(`assessments/${encodeURIComponent(id)}`, { json: payload })
            .json<AssessmentMetadata>();
    },

    updatePdf(
        id: string,
        payload: {
            title?: string;
            description?: string;
            assessment_type?: AssessmentType;
            visibility?: AssessmentVisibility;
            is_practice_enabled?: boolean;
            file?: File;
        }
    ): Promise<AssessmentMetadata> {
        const formData: FormData = new FormData();
        if (payload.title !== undefined) {
            formData.append("title", payload.title);
        }
        if (payload.description !== undefined) {
            formData.append("description", payload.description);
        }
        if (payload.assessment_type !== undefined) {
            formData.append("assessment_type", payload.assessment_type);
        }
        if (payload.visibility !== undefined) {
            formData.append("visibility", payload.visibility);
        }
        if (payload.is_practice_enabled !== undefined) {
            formData.append("is_practice_enabled", String(payload.is_practice_enabled));
        }
        if (payload.file !== undefined) {
            formData.append("file", payload.file);
        }
        return api
            .put(`assessments/${encodeURIComponent(id)}`, { body: formData })
            .json<AssessmentMetadata>();
    },

    async delete(id: string): Promise<void> {
        await api.delete(`assessments/${encodeURIComponent(id)}`);
    },

    getContent(id: string): Promise<AssessmentContentResponse> {
        return api
            .get(`assessments/${encodeURIComponent(id)}/content`)
            .json<AssessmentContentResponse>();
    },

    getAnswerKey(id: string): Promise<AnswerKeyDocument> {
        return api
            .get(`assessments/${encodeURIComponent(id)}/answer-key`)
            .json<AnswerKeyDocument>();
    },

    upsertAnswerKey(id: string, answers: AnswerKeyItem[]): Promise<AnswerKeyDocument> {
        return api
            .put(`assessments/${encodeURIComponent(id)}/answer-key`, { json: { answers } })
            .json<AnswerKeyDocument>();
    },

    favorite(id: string): Promise<{ assessment_id: string; favorited: boolean }> {
        return api
            .post(`assessments/${encodeURIComponent(id)}/favorite`)
            .json<{ assessment_id: string; favorited: boolean }>();
    },

    unfavorite(id: string): Promise<{ assessment_id: string; favorited: boolean }> {
        return api
            .delete(`assessments/${encodeURIComponent(id)}/favorite`)
            .json<{ assessment_id: string; favorited: boolean }>();
    }
};

export const contestsApi = {
    list(
        query: {
            page?: number;
            limit?: number;
            group_id?: string;
            visibility?: ContestVisibility;
            status?: ContestStatus;
            phase?: ContestPhase;
            search?: string;
        } = {}
    ): Promise<PaginatedResult<ContestSummary>> {
        return api
            .get("contests", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<ContestSummary>>();
    },

    create(payload: {
        group_id: string;
        assessment_id: string;
        title: string;
        description: string;
        visibility: ContestVisibility;
        start_time: string;
        end_time: string;
        submission_policy: ContestSubmissionPolicy;
        status: "DRAFT" | "PUBLISHED";
    }): Promise<ContestSummary> {
        return api.post("contests", { json: payload }).json<ContestSummary>();
    },

    getById(id: string): Promise<ContestSummary> {
        return api.get(`contests/${encodeURIComponent(id)}`).json<ContestSummary>();
    },

    update(
        id: string,
        payload: {
            title?: string;
            description?: string;
            visibility?: ContestVisibility;
            start_time?: string;
            end_time?: string;
            submission_policy?: ContestSubmissionPolicy;
            status?: "DRAFT" | "PUBLISHED";
        }
    ): Promise<ContestSummary> {
        return api
            .patch(`contests/${encodeURIComponent(id)}`, { json: payload })
            .json<ContestSummary>();
    },

    async delete(id: string): Promise<void> {
        await api.delete(`contests/${encodeURIComponent(id)}`);
    },

    cancel(id: string): Promise<ContestSummary> {
        return api.post(`contests/${encodeURIComponent(id)}/cancel`).json<ContestSummary>();
    },

    getParticipation(id: string): Promise<ContestParticipationInfo> {
        return api
            .get(`contests/${encodeURIComponent(id)}/participation`)
            .json<ContestParticipationInfo>();
    }
};

export const submissionsApi = {
    create(
        payload: {
            submission_mode: SubmissionMode;
            trigger_type?: SubmissionTriggerType;
            contest_id?: string;
            assessment_id?: string;
            answers: SubmittedAnswerInput[];
        },
        idempotencyKey?: string
    ): Promise<SubmissionRecord> {
        return api
            .post("submissions", {
                json: payload,
                headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined
            })
            .json<SubmissionRecord>();
    },

    listMine(
        query: {
            page?: number;
            limit?: number;
            group_id?: string;
            contest_id?: string;
            assessment_id?: string;
            grading_status?: SubmissionGradingStatus;
            submission_mode?: SubmissionMode;
        } = {}
    ): Promise<PaginatedResult<SubmissionRecord>> {
        return api
            .get("submissions/me", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<SubmissionRecord>>();
    },

    listByGroup(query: {
        group_id: string;
        page?: number;
        limit?: number;
        contest_id?: string;
        assessment_id?: string;
        grading_status?: SubmissionGradingStatus;
        submission_mode?: SubmissionMode;
        is_final_attempt?: boolean;
    }): Promise<PaginatedResult<SubmissionRecord>> {
        return api
            .get("submissions", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<SubmissionRecord>>();
    },

    getById(id: string): Promise<SubmissionRecord> {
        return api.get(`submissions/${encodeURIComponent(id)}`).json<SubmissionRecord>();
    },

    gradeEssays(id: string, grades: ManualGradeItem[]): Promise<SubmissionRecord> {
        return api
            .patch(`submissions/${encodeURIComponent(id)}/grade`, { json: { grades } })
            .json<SubmissionRecord>();
    }
};

export const notificationsApi = {
    list(query: { unread_only?: boolean; limit?: number } = {}): Promise<NotificationItem[]> {
        return api
            .get("notifications", { searchParams: cleanSearchParams(query) })
            .json<NotificationItem[]>();
    },

    async markRead(id: string): Promise<void> {
        await api.patch(`notifications/${encodeURIComponent(id)}/read`);
    }
};

export const adminApi = {
    listUsers(
        query: {
            page?: number;
            limit?: number;
            search?: string;
            status?: UserStatus;
            role?: UserSystemRole;
        } = {}
    ): Promise<PaginatedResult<AdminUserRecord>> {
        return api
            .get("admin/users", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<AdminUserRecord>>();
    },

    updateUserStatus(
        id: string,
        status: UserStatus,
        reason?: string
    ): Promise<AdminUserRecord> {
        return api
            .patch(`admin/users/${encodeURIComponent(id)}/status`, {
                json: reason ? { status, reason } : { status }
            })
            .json<AdminUserRecord>();
    },

    updateUserRole(id: string, system_role: UserSystemRole): Promise<AdminUserRecord> {
        return api
            .patch(`admin/users/${encodeURIComponent(id)}/role`, {
                json: { system_role }
            })
            .json<AdminUserRecord>();
    },

    listGroups(
        query: {
            page?: number;
            limit?: number;
            search?: string;
            status?: GroupStatus;
            visibility?: GroupVisibility;
        } = {}
    ): Promise<PaginatedResult<AdminGroupRecord>> {
        return api
            .get("admin/groups", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<AdminGroupRecord>>();
    },

    updateGroupStatus(
        id: string,
        status: GroupStatus,
        reason?: string
    ): Promise<AdminGroupRecord> {
        return api
            .patch(`admin/groups/${encodeURIComponent(id)}/status`, {
                json: reason ? { status, reason } : { status }
            })
            .json<AdminGroupRecord>();
    },

    async deleteGroup(id: string, reason?: string): Promise<void> {
        await api.delete(
            `admin/groups/${encodeURIComponent(id)}`,
            reason ? { json: { reason } } : undefined
        );
    },

    listAssessments(
        query: {
            page?: number;
            limit?: number;
            group_id?: string;
            status?: AssessmentStatus;
            visibility?: AssessmentVisibility;
            search?: string;
        } = {}
    ): Promise<PaginatedResult<AdminAssessmentRecord>> {
        return api
            .get("admin/assessments", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<AdminAssessmentRecord>>();
    },

    updateAssessmentStatus(
        id: string,
        status: AssessmentStatus,
        reason?: string
    ): Promise<AdminAssessmentRecord> {
        return api
            .patch(`admin/assessments/${encodeURIComponent(id)}/status`, {
                json: reason ? { status, reason } : { status }
            })
            .json<AdminAssessmentRecord>();
    },

    async deleteAssessment(id: string, reason?: string): Promise<void> {
        await api.delete(
            `admin/assessments/${encodeURIComponent(id)}`,
            reason ? { json: { reason } } : undefined
        );
    },

    listContests(
        query: {
            page?: number;
            limit?: number;
            group_id?: string;
            visibility?: ContestVisibility;
            status?: ContestStatus;
            phase?: ContestPhase;
            search?: string;
        } = {}
    ): Promise<PaginatedResult<AdminContestRecord>> {
        return api
            .get("admin/contests", { searchParams: cleanSearchParams(query) })
            .json<PaginatedResult<AdminContestRecord>>();
    },

    updateContestStatus(
        id: string,
        status: ContestStatus,
        reason?: string
    ): Promise<AdminContestRecord> {
        return api
            .patch(`admin/contests/${encodeURIComponent(id)}/status`, {
                json: reason ? { status, reason } : { status }
            })
            .json<AdminContestRecord>();
    },

    async deleteContest(id: string, reason?: string): Promise<void> {
        await api.delete(
            `admin/contests/${encodeURIComponent(id)}`,
            reason ? { json: { reason } } : undefined
        );
    }
};
