import type { EntityManager } from "@mikro-orm/postgresql";

export enum UserSystemRole {
    USER = "USER",
    ADMIN = "ADMIN"
}

export enum GroupVisibility {
    PUBLIC = "PUBLIC",
    PRIVATE = "PRIVATE"
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

export enum AssessmentVisibility {
    DRAFT = "DRAFT",
    PRIVATE = "PRIVATE",
    PUBLIC = "PUBLIC"
}

export enum AssessmentStatus {
    ACTIVE = "ACTIVE",
    HIDDEN = "HIDDEN"
}

export enum ContestVisibility {
    PUBLIC = "PUBLIC",
    PRIVATE = "PRIVATE"
}

export enum ContestSubmissionPolicy {
    SINGLE = "SINGLE",
    MULTIPLE = "MULTIPLE"
}

export enum ContestStatus {
    DRAFT = "DRAFT",
    PUBLISHED = "PUBLISHED",
    CANCELLED = "CANCELLED"
}

export enum ContestPhase {
    DRAFT = "DRAFT",
    UPCOMING = "UPCOMING",
    ONGOING = "ONGOING",
    ENDED = "ENDED",
    CANCELLED = "CANCELLED"
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
