import type { Account, AppServices } from "../contracts/services";
import { hasSystemPermission, type SystemRole } from "../../authorization/permissions";
import {
    activeAccount,
    authenticateAccount,
    readAccounts,
    registerAccount,
    setAccountStatus,
    toggleFollow,
    updateProfile,
    type MockAccount,
} from "./accounts";
import { MOCK_RBAC_EMAIL } from "./constants";
import { getPreviewRole, isMockSystemAdmin, PREVIEW_DATA_KEY, setPreviewRole, type PreviewRole } from "./rolePreview";
import { createMockDataSource } from "./mockDataSource";

const SESSION_KEY: string = "lms-v2-session";

export function createMockServices(): AppServices {
    return {
        demo: {
            authNotice: "Tài khoản mock: user@lms.local, owner@lms.local, moderator@lms.local hoặc admin@lms.local; mật khẩu demo123. Không nhập mật khẩu thật.",
            roleHint: "Thử đổi vai trò: rbac@lms.local / demo123",
            banner: "Dữ liệu được lưu trên trình duyệt của bạn.",
        },
        createDataSource: createMockDataSource,
        accounts: {
            async list(): Promise<Account[]> {
                return (await readAccounts()).map((account: MockAccount): Account => ({
                    email: account.email,
                    displayName: account.displayName,
                    bio: account.bio,
                    status: account.status,
                    follows: [...account.follows],
                }));
            },
            register: registerAccount,
            authenticate: authenticateAccount,
            isActive: activeAccount,
            updateProfile,
            toggleFollow,
            setStatus: setAccountStatus,
            isSystemAdmin(email: string): boolean {
                const role: SystemRole = isMockSystemAdmin(email) ? "SYSTEM_ADMIN" : "USER";
                return hasSystemPermission(role, "ACCESS_ADMIN");
            },
        },
        session: {
            read(): string {
                return sessionStorage.getItem(SESSION_KEY) ?? "";
            },
            save(email: string): void {
                sessionStorage.setItem(SESSION_KEY, email);
            },
            clear(): void {
                sessionStorage.removeItem(SESSION_KEY);
            },
        },
        rolePreview: {
            isEnabled(email: string): boolean {
                return email === MOCK_RBAC_EMAIL;
            },
            read(): string {
                return getPreviewRole();
            },
            set(role: string): void {
                if (role !== "VISITOR" && role !== "MEMBER" && role !== "MODERATOR" && role !== "OWNER" && role !== "SYSTEM_ADMIN") {
                    throw new Error("Vai trò thử nghiệm không hợp lệ.");
                }
                setPreviewRole(role as PreviewRole);
            },
            reset(): void {
                sessionStorage.removeItem(PREVIEW_DATA_KEY);
                sessionStorage.removeItem("lms-rbac-preview-accounts-v1");
                const draftPrefix: string = `lms-v2-draft:${MOCK_RBAC_EMAIL}:`;
                const keys: string[] = [];
                for (let index: number = 0; index < localStorage.length; index += 1) {
                    const key: string | null = localStorage.key(index);
                    if (key?.startsWith(draftPrefix)) keys.push(key);
                }
                keys.forEach((key: string): void => localStorage.removeItem(key));
            },
        },
    };
}
