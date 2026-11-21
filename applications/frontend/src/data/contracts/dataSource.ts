import type { Assessment, Contest, Group, Snapshot } from "../../types";

// Các hợp đồng này mô tả nhu cầu hiện tại của giao diện, không phải OpenAPI backend.
// TODO: Đối chiếu ID, vai trò nhóm và quy trình thành viên với contract Group.
export interface GroupDataSource {
    createGroup(group: Group): Promise<void>;
    updateGroup(
        groupId: string,
        name: string,
        description: string,
        visibility: Group["visibility"],
        joinPolicy: Group["joinPolicy"],
        password: string,
    ): Promise<void>;
    joinGroup(groupId: string, password: string): Promise<void>;
    leaveGroup(groupId: string): Promise<void>;
    reviewJoinRequest(
        groupId: string,
        userEmail: string,
        decision: "APPROVE" | "REJECT",
    ): Promise<void>;
    setGroupMemberRole(
        groupId: string,
        userEmail: string,
        role: "MEMBER" | "MODERATOR",
    ): Promise<void>;
    removeGroupMember(groupId: string, userEmail: string): Promise<void>;
    banGroupMember(groupId: string, userEmail: string): Promise<void>;
    unbanGroupMember(groupId: string, userEmail: string): Promise<void>;
    transferGroupOwnership(groupId: string, userEmail: string): Promise<void>;
    deleteOwnedGroup(groupId: string): Promise<void>;
}

// TODO: Đối chiếu cấu trúc câu hỏi, đáp án, PDF và quyền truy cập với contract Assessment.
export interface AssessmentDataSource {
    createAssessment(assessment: Assessment): Promise<void>;
    updateAssessment(assessment: Assessment): Promise<void>;
    deleteAssessment(assessmentId: string): Promise<void>;
    toggleFavorite(assessmentId: string): Promise<void>;
}

// TODO: Đối chiếu thời gian, quyền tham gia và chính sách nộp với contract Contest/Submission.
export type AttemptStatus =
    | { state: "NOT_STARTED" }
    | { state: "IN_PROGRESS" }
    | { state: "SUBMITTED"; submissionId: string };

export interface ContestDataSource {
    createContest(contest: Contest): Promise<void>;
    startAttempt(contestId: string): Promise<void>;
    getAttemptStatus(contestId: string): Promise<AttemptStatus>;
    submit(contestId: string, answers: Record<string, string[]>, auto?: boolean): Promise<void>;
}

// TODO: Tích hợp lấy bài nộp và chấm bài theo contract Submission/Grading.
export interface SubmissionDataSource {
    grade(id: string, score: number, feedback: string): Promise<void>;
}

// TODO: Ánh xạ danh sách, trạng thái đọc và tài nguyên từ contract Notification qua Gateway.
export interface NotificationDataSource {
    markRead(id: string): Promise<void>;
}

// TODO: Xác nhận quyền và thao tác kiểm duyệt hệ thống trước khi kết nối API Admin.
export interface AdminDataSource {
    adminDeleteGroup(groupId: string): Promise<void>;
    adminDeleteAssessment(assessmentId: string): Promise<void>;
    adminDeleteContest(contestId: string): Promise<void>;
}

// TODO: Đối chiếu từng thao tác và DTO với OpenAPI của service trước khi triển khai adapter Gateway.
// TODO: Thay read() tổng hợp bằng cách tải dữ liệu theo endpoint và nhu cầu từng màn hình.
export interface DataSource
    extends GroupDataSource,
        AssessmentDataSource,
        ContestDataSource,
        SubmissionDataSource,
        NotificationDataSource,
        AdminDataSource {
    read(): Promise<Snapshot>;
}
