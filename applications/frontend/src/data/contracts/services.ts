import type { DataSource } from "./dataSource";

export type Account = {
    email: string;
    displayName: string;
    bio: string;
    status: "ACTIVE" | "SUSPENDED" | "BANNED";
    follows: string[];
};

export interface AccountService {
    // TODO: Đối chiếu danh tính, vai trò, phiên và lỗi với contract xác thực của Gateway.
    list(): Promise<Account[]>;
    register(email: string, password: string): Promise<void>;
    authenticate(email: string, password: string): Promise<string>;
    isActive(email: string): Promise<boolean>;
    changePassword(email: string, currentPassword: string, newPassword: string): Promise<void>;
    updateProfile(email: string, displayName: string, bio: string): Promise<void>;
    toggleFollow(email: string, target: string): Promise<void>;
    setStatus(actor: string, target: string, status: Account["status"]): Promise<void>;
    isSystemAdmin(email: string): boolean;
}

export interface SessionStore {
    read(): string;
    save(email: string): void;
    clear(): void;
}

export interface AppServices {
    createDataSource(email: string): DataSource;
    accounts: AccountService;
    session: SessionStore;
    demo?: {
        authNotice: string;
        roleHint: string;
        banner: string;
    };
    rolePreview?: {
        isEnabled(email: string): boolean;
        read(): string;
        set(role: string): void;
        reset(): void;
    };
}
