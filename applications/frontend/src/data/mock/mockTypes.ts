import type { Assessment, Contest, Group, GroupRole, Notice, Submission } from "../../types";

export type Memberships = Record<string, Record<string, GroupRole>>;
export type Pending = Record<string, Record<string, boolean>>;
export type RecipientNotice = Notice & { recipientEmail: string };
export type MockStore = {
    groups: Group[];
    assessments: Assessment[];
    contests: Contest[];
    submissions: Submission[];
    notifications: RecipientNotice[];
    memberships: Memberships;
    pending: Pending;
    favorites?: Record<string, string[]>;
    bans?: Record<string, string[]>;
    attempts?: Record<string, number>;
    previewRole?: string;
};
