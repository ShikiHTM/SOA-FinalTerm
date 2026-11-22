import type { EntityManager } from "@mikro-orm/postgresql";

export enum UserSystemRole {
    USER = "USER",
    ADMIN = "ADMIN"
}

export enum UserStatus {
    ACTIVE = "ACTIVE",
    SUSPENDED = "SUSPENDED",
    BANNED = "BANNED"
}

export enum OAuthProvider {
    GOOGLE = "GOOGLE",
    GITHUB = "GITHUB"
}

export interface JwtTokenPayload {
    [key: string]: unknown;
    sub: string;
    user_id: string;
    user_role: UserSystemRole;
    jti: string;
    iat: number;
    exp: number;
}

export interface VerifiedTokenResult {
    valid: boolean;
    user_id: string;
    user_role: UserSystemRole;
    status: UserStatus;
}

export interface AuthUserSummary {
    id: string;
    email: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    system_role: UserSystemRole;
    status: UserStatus;
}

export interface AuthResponse {
    token: string;
    token_type: "Bearer";
    expires_at: string;
    user: AuthUserSummary;
}

export interface HonoVariables {
    em: EntityManager;
    userId?: string;
    userRole?: UserSystemRole;
}

export interface AppEnv {
    Variables: HonoVariables;
}

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
