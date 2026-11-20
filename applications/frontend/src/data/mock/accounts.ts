import { MOCK_ADMIN_EMAIL, MOCK_MODERATOR_EMAIL, MOCK_OWNER_EMAIL, MOCK_PASSWORD, MOCK_RBAC_EMAIL, MOCK_USER_EMAIL } from "./constants";
import { isMockSystemAdmin } from "./rolePreview";

export type MockAccount = {
    email: string;
    displayName: string;
    bio: string;
    passwordHash: string;
    status: "ACTIVE" | "SUSPENDED" | "BANNED";
    follows: string[];
};

const ACCOUNTS_KEY: string = "lms-mock-accounts-v1";
const PREVIEW_ACCOUNTS_KEY: string = "lms-rbac-preview-accounts-v1";
const DEFAULT_EMAILS: string[] = [MOCK_USER_EMAIL, MOCK_OWNER_EMAIL, MOCK_MODERATOR_EMAIL, MOCK_ADMIN_EMAIL, MOCK_RBAC_EMAIL];

function accountsKey(): string {
    return sessionStorage.getItem("lms-v2-session") === MOCK_RBAC_EMAIL ? PREVIEW_ACCOUNTS_KEY : ACCOUNTS_KEY;
}

function accountsStorage(): Storage {
    return accountsKey() === PREVIEW_ACCOUNTS_KEY ? sessionStorage : localStorage;
}

async function hashPassword(password: string): Promise<string> {
    const bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode(password);
    const digest: ArrayBuffer = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((value: number): string => value.toString(16).padStart(2, "0")).join("");
}

export async function readAccounts(): Promise<MockAccount[]> {
    const raw: string | null = accountsStorage().getItem(accountsKey());
    if (raw) {
        const accounts: MockAccount[] = JSON.parse(raw) as MockAccount[];
        if (!accounts.some((account: MockAccount): boolean => account.email === MOCK_RBAC_EMAIL)) {
            accounts.push({ email: MOCK_RBAC_EMAIL, displayName: "rbac", bio: "", passwordHash: await hashPassword(MOCK_PASSWORD), status: "ACTIVE", follows: [] });
            saveAccounts(accounts);
        }
        return accounts;
    }
    const passwordHash: string = await hashPassword(MOCK_PASSWORD);
    const accounts: MockAccount[] = DEFAULT_EMAILS.map((email: string): MockAccount => ({
        email, displayName: email.split("@")[0], bio: "", passwordHash, status: "ACTIVE", follows: [],
    }));
    saveAccounts(accounts);
    return accounts;
}

function saveAccounts(accounts: MockAccount[]): void {
    accountsStorage().setItem(accountsKey(), JSON.stringify(accounts));
}

export async function registerAccount(email: string, password: string): Promise<void> {
    const normalized: string = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || password.length < 6) throw new Error("Email hoặc mật khẩu thử nghiệm không hợp lệ.");
    const accounts: MockAccount[] = await readAccounts();
    if (accounts.some((account: MockAccount): boolean => account.email === normalized)) throw new Error("Email này đã được đăng ký.");
    accounts.push({ email: normalized, displayName: normalized.split("@")[0], bio: "", passwordHash: await hashPassword(password), status: "ACTIVE", follows: [] });
    saveAccounts(accounts);
}

export async function authenticateAccount(email: string, password: string): Promise<string> {
    const normalized: string = email.trim().toLowerCase();
    const account: MockAccount | undefined = (await readAccounts()).find((item: MockAccount): boolean => item.email === normalized);
    if (!account || account.passwordHash !== await hashPassword(password)) throw new Error("Email hoặc mật khẩu chưa đúng.");
    if (account.status !== "ACTIVE") throw new Error("Tài khoản đang bị hạn chế.");
    return account.email;
}

export async function activeAccount(email: string): Promise<boolean> {
    return (await readAccounts()).some((account: MockAccount): boolean => account.email === email && account.status === "ACTIVE");
}

export async function updateProfile(email: string, displayName: string, bio: string): Promise<void> {
    const accounts: MockAccount[] = await readAccounts();
    const account: MockAccount | undefined = accounts.find((item: MockAccount): boolean => item.email === email && item.status === "ACTIVE");
    if (!account || !displayName.trim()) throw new Error("Tài khoản hoặc tên hiển thị không hợp lệ.");
    account.displayName = displayName.trim();
    account.bio = bio.trim();
    saveAccounts(accounts);
}

export async function toggleFollow(email: string, target: string): Promise<void> {
    const accounts: MockAccount[] = await readAccounts();
    const account: MockAccount | undefined = accounts.find((item: MockAccount): boolean => item.email === email && item.status === "ACTIVE");
    if (!account || email === target || !accounts.some((item: MockAccount): boolean => item.email === target)) throw new Error("Không thể theo dõi tài khoản này.");
    account.follows = account.follows.includes(target) ? account.follows.filter((item: string): boolean => item !== target) : [...account.follows, target];
    saveAccounts(accounts);
}

export async function setAccountStatus(actor: string, target: string, status: MockAccount["status"]): Promise<void> {
    if (!isMockSystemAdmin(actor) || actor === target) throw new Error("Không có quyền thay đổi tài khoản này.");
    const accounts: MockAccount[] = await readAccounts();
    const account: MockAccount | undefined = accounts.find((item: MockAccount): boolean => item.email === target);
    if (!account) throw new Error("Không tìm thấy tài khoản.");
    account.status = status;
    saveAccounts(accounts);
}
