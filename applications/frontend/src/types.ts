export type GroupRole = "OWNER" | "MODERATOR" | "MEMBER" | "VISITOR";
export type QuestionKind = "SINGLE" | "MULTIPLE" | "FILL" | "ESSAY";
export type Group = {
    id: string;
    name: string;
    code: string;
    description: string;
    visibility: "PUBLIC" | "PRIVATE";
    role: GroupRole;
    joinPolicy: "OPEN" | "APPROVAL" | "PASSWORD";
    pending?: boolean;
    password?: string;
};
export type Question = {
    id: string;
    kind: QuestionKind;
    text: string;
    points: number;
    options: string[];
    answers: string[];
};
export type Assessment = {
    id: string;
    groupId: string;
    title: string;
    description: string;
    source: "DIRECT" | "PDF";
    pdfName?: string;
    practice: boolean;
    questions: Question[];
};
export type Contest = {
    id: string;
    assessmentId: string;
    title: string;
    startAt: string;
    endAt: string;
    policy: "SINGLE" | "MULTIPLE";
};
export type Submission = {
    id: string;
    authorEmail: string;
    contestId: string;
    answers: Record<string, string[]>;
    submittedAt: string;
    status: "PENDING" | "GRADED";
    score?: number;
    feedback?: string;
};
export type Notice = {
    id: string;
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
    href: string;
};
export type JoinRequest = { groupId: string; userEmail: string };
export type GroupMember = { groupId: string; userEmail: string; role: GroupRole };
export type Snapshot = {
    groups: Group[];
    assessments: Assessment[];
    contests: Contest[];
    submissions: Submission[];
    notifications: Notice[];
    joinRequests: JoinRequest[];
    groupMembers: GroupMember[];
    bannedMembers: { groupId: string; userEmail: string }[];
    favoriteAssessmentIds: string[];
};
