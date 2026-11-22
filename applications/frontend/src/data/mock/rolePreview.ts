import { MOCK_ADMIN_EMAIL, MOCK_RBAC_EMAIL } from "./constants";

export type PreviewRole = "VISITOR" | "MEMBER" | "MODERATOR" | "OWNER" | "SYSTEM_ADMIN";

export const PREVIEW_GROUP_ID: string = "private";
export const PREVIEW_DATA_KEY: string = "lms-rbac-preview-data-v1";
const PREVIEW_ROLE_KEY: string = "lms-rbac-preview-role-v1";

export function getPreviewRole(): PreviewRole {
    const role: string | null = sessionStorage.getItem(PREVIEW_ROLE_KEY);
    if (role === "MEMBER" || role === "MODERATOR" || role === "OWNER" || role === "SYSTEM_ADMIN") {
        return role;
    }
    return "VISITOR";
}

export function setPreviewRole(role: PreviewRole): void {
    if (!["VISITOR", "MEMBER", "MODERATOR", "OWNER", "SYSTEM_ADMIN"].includes(role)) {
        throw new Error("Vai trò thử nghiệm không hợp lệ.");
    }
    sessionStorage.setItem(PREVIEW_ROLE_KEY, role);
}

export function isMockSystemAdmin(email: string): boolean {
    return email === MOCK_ADMIN_EMAIL || (email === MOCK_RBAC_EMAIL && getPreviewRole() === "SYSTEM_ADMIN");
}
