import type { Assessment, Contest, Group, Snapshot } from "../../types";

// Các hợp đồng này mô tả nhu cầu hiện tại của giao diện, không phải OpenAPI backend.
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

export interface AssessmentDataSource {
    createAssessment(assessment: Assessment): Promise<void>;
    updateAssessment(assessment: Assessment): Promise<void>;
    deleteAssessment(assessmentId: string): Promise<void>;
    toggleFavorite(assessmentId: string): Promise<void>;
}

export interface ContestDataSource {
    createContest(contest: Contest): Promise<void>;
    startAttempt(contestId: string): Promise<void>;
    submit(contestId: string, answers: Record<string, string[]>, auto?: boolean): Promise<void>;
}

export interface SubmissionDataSource {
    grade(id: string, score: number, feedback: string): Promise<void>;
}

export interface NotificationDataSource {
    markRead(id: string): Promise<void>;
}

export interface AdminDataSource {
    adminDeleteGroup(groupId: string): Promise<void>;
    adminDeleteAssessment(assessmentId: string): Promise<void>;
    adminDeleteContest(contestId: string): Promise<void>;
}

// read() hiện gom dữ liệu mock; adapter API có thể cần gọi nhiều endpoint riêng.
export interface DataSource
    extends GroupDataSource,
        AssessmentDataSource,
        ContestDataSource,
        SubmissionDataSource,
        NotificationDataSource,
        AdminDataSource {
    read(): Promise<Snapshot>;
}
