export type UserSystemRole = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";
export type OAuthProvider = "GOOGLE" | "GITHUB";

export type GroupVisibility = "PUBLIC" | "PRIVATE";
export type GroupJoinPolicy = "OPEN" | "APPROVAL" | "PASSWORD";
export type GroupStatus = "ACTIVE" | "SUSPENDED";
export type GroupMemberRole = "MEMBER" | "MODERATOR" | "OWNER";
export type GroupRole = GroupMemberRole | "VISITOR";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AssessmentType = "MULTI_CHOICE" | "ESSAY" | "HYBRID";
export type AssessmentCreationMode = "DIRECT" | "PDF_IMPORT";
export type AssessmentContentFormat = "JSON" | "PDF";
export type AssessmentVisibility = "DRAFT" | "PRIVATE" | "PUBLIC";
export type AssessmentStatus = "ACTIVE" | "HIDDEN";
export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "FILL_IN_THE_BLANK" | "ESSAY";

export type ContestVisibility = "PUBLIC" | "PRIVATE";
export type ContestSubmissionPolicy = "SINGLE" | "MULTIPLE";
export type ContestStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";
export type ContestPhase = "DRAFT" | "UPCOMING" | "ONGOING" | "ENDED" | "CANCELLED";

export type SubmissionMode = "CONTEST" | "PRACTICE";
export type SubmissionTriggerType = "MANUAL" | "AUTO_TIMEOUT";
export type SubmissionGradingStatus =
    | "QUEUED"
    | "AUTO_GRADED"
    | "PENDING_MANUAL"
    | "GRADED"
    | "FAILED";
export type AnswerGradingStatus = "PENDING" | "AUTO_GRADED" | "MANUALLY_GRADED";

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

export interface PaginatedResult<T> {
    items: T[];
    pagination: PaginationMeta;
}

export interface UserSummary {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    system_role: UserSystemRole;
    status: UserStatus;
}

export interface AuthUserSummary extends UserSummary {
    email: string;
}

export interface AuthResponse {
    token: string;
    token_type: "Bearer";
    expires_at: string;
    user: AuthUserSummary;
}

export interface PrivacySettings {
    show_email: boolean;
    show_bio: boolean;
    show_followers: boolean;
    show_following: boolean;
}

export interface OwnUserProfile extends AuthUserSummary {
    bio: string | null;
    privacy_settings: PrivacySettings;
    has_password: boolean;
    linked_providers: OAuthProvider[];
    followers_count: number;
    following_count: number;
    created_at: string;
    updated_at: string;
}

export interface PublicUserProfile {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    email: string | null;
    status: UserStatus;
    restricted: boolean;
    followers_count: number | null;
    following_count: number | null;
    is_following: boolean;
    created_at: string;
}

export interface UserFollowItem {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    followed_at: string;
}

export interface FollowActionResponse {
    following: boolean;
    followers_count: number;
}

export interface AdminUserRecord extends OwnUserProfile {
    moderation_reason: string | null;
    moderated_at: string | null;
}

export interface GroupSummary {
    id: string;
    group_code: string;
    name: string;
    description: string;
    visibility: GroupVisibility;
    join_policy: GroupJoinPolicy;
    owner_id: string;
    status: GroupStatus;
    member_count: number;
    my_role: GroupMemberRole | null;
    created_at: string;
    updated_at: string;
    owner?: UserSummary | null;
}

export interface AdminGroupRecord extends Omit<GroupSummary, "my_role"> {
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
}

export interface GroupMemberRecord {
    group_id: string;
    user_id: string;
    role: GroupMemberRole;
    joined_at: string;
    updated_at: string;
    user?: UserSummary | null;
}

export interface JoinRequestRecord {
    id: string;
    group_id: string;
    user_id: string;
    status: JoinRequestStatus;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    user?: UserSummary | null;
    reviewer?: UserSummary | null;
}

export interface GroupBanRecord {
    id: string;
    group_id: string;
    user_id: string;
    reason: string | null;
    banned_by: string;
    banned_at: string;
    user?: UserSummary | null;
    banned_by_user?: UserSummary | null;
}

export interface QuestionOption {
    key: string;
    text: string;
}

export interface PublicQuestion {
    id: string;
    order: number;
    question_type: QuestionType;
    prompt: string;
    points: number;
    options: QuestionOption[] | null;
}

export interface QuestionInput extends PublicQuestion {
    correct_answer?: string | string[] | null;
    grading_rubric?: string | null;
}

export interface AnswerKeyItem {
    question_id: string;
    question_type: QuestionType;
    points: number;
    correct_answer?: string | string[] | null;
    grading_rubric?: string | null;
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
    creator?: UserSummary | null;
    group?: GroupSummary | null;
}

export interface AdminAssessmentRecord extends AssessmentMetadata {
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
}

export interface AssessmentContentResponse {
    assessment_id: string;
    version: number;
    content_format: AssessmentContentFormat;
    pdf_url: string | null;
    pdf_url_expires_in_seconds: number | null;
    questions: PublicQuestion[] | null;
}

export interface FavoriteAssessmentItem {
    favorited_at: string;
    assessment: AssessmentMetadata;
}

export interface ContestAssessmentSummary {
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

export interface ContestParticipationInfo {
    contest_id: string;
    group_id: string;
    assessment_id: string;
    assessment_version: number;
    visibility: ContestVisibility;
    status: ContestStatus;
    phase: ContestPhase;
    start_time: string;
    end_time: string;
    submission_policy: ContestSubmissionPolicy;
    is_group_member: boolean;
    can_participate: boolean;
    denial_reason: string | null;
}

export interface ContestSummary {
    id: string;
    group_id: string;
    assessment_id: string;
    assessment_version: number;
    organizer_id: string;
    title: string;
    description: string;
    visibility: ContestVisibility;
    start_time: string;
    end_time: string;
    submission_policy: ContestSubmissionPolicy;
    status: ContestStatus;
    phase: ContestPhase;
    created_at: string;
    updated_at: string;
    organizer?: UserSummary | null;
    group?: GroupSummary | null;
    assessment?: ContestAssessmentSummary | null;
    participation?: ContestParticipationInfo | null;
}

export interface AdminContestRecord extends ContestSummary {
    moderation_reason: string | null;
    moderated_by: string | null;
    moderated_at: string | null;
}

export interface SubmittedAnswerInput {
    question_id: string;
    question_type?: QuestionType;
    student_response: string | string[];
}

export interface SubmissionAnswer {
    id: string;
    submission_id: string;
    question_id: string;
    question_type: QuestionType;
    student_response: unknown;
    expected_answer_snapshot?: unknown;
    max_points: number;
    earned_points: number | null;
    is_correct: boolean | null;
    grading_status: AnswerGradingStatus;
    grader_id: string | null;
    grader_feedback: string | null;
    graded_at: string | null;
}

export interface SubmissionRecord {
    id: string;
    user_id: string;
    group_id: string;
    contest_id: string | null;
    assessment_id: string;
    assessment_version: number;
    submission_mode: SubmissionMode;
    trigger_type: SubmissionTriggerType;
    attempt_number: number;
    is_final_attempt: boolean;
    grading_status: SubmissionGradingStatus;
    objective_score: number | null;
    essay_score: number | null;
    total_score: number | null;
    max_score: number;
    submitted_at: string;
    auto_graded_at: string | null;
    final_graded_at: string | null;
    created_at: string;
    updated_at: string;
    answers?: SubmissionAnswer[];
    student?: UserSummary | null;
    grader?: UserSummary | null;
    group?: GroupSummary | null;
    assessment?: ContestAssessmentSummary | null;
    contest?: ContestSummary | null;
}

export interface ManualGradeItem {
    question_id: string;
    earned_points: number;
    grader_feedback?: string | null;
}

export type NotificationType =
    | "GROUP_JOIN_APPROVED"
    | "GROUP_JOIN_REJECTED"
    | "CONTEST_PUBLISHED"
    | "CONTEST_STARTING"
    | "SUBMISSION_GRADED";

export interface NotificationItem {
    id: string;
    recipient_user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    resource_type: "GROUP" | "CONTEST" | "SUBMISSION" | null;
    resource_id: string | null;
    is_read: boolean;
    created_at: string;
}
