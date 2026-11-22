import type { EntityManager } from "@mikro-orm/postgresql";

export enum UserSystemRole {
    USER = "USER",
    ADMIN = "ADMIN"
}

export enum GroupVisibility {
    PUBLIC = "PUBLIC",
    PRIVATE = "PRIVATE"
}

export enum GroupJoinPolicy {
    OPEN = "OPEN",
    APPROVAL = "APPROVAL",
    PASSWORD = "PASSWORD"
}

export enum GroupStatus {
    ACTIVE = "ACTIVE",
    SUSPENDED = "SUSPENDED"
}

export enum GroupMemberRole {
    MEMBER = "MEMBER",
    MODERATOR = "MODERATOR",
    OWNER = "OWNER"
}

export enum JoinRequestStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED"
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
