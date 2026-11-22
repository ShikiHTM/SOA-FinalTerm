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

export enum AssessmentType {
    MULTI_CHOICE = "MULTI_CHOICE",
    ESSAY = "ESSAY",
    HYBRID = "HYBRID"
}

export enum AssessmentCreationMode {
    DIRECT = "DIRECT",
    PDF_IMPORT = "PDF_IMPORT"
}

export enum AssessmentContentFormat {
    JSON = "JSON",
    PDF = "PDF"
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

export enum QuestionType {
    SINGLE_CHOICE = "SINGLE_CHOICE",
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
    FILL_IN_THE_BLANK = "FILL_IN_THE_BLANK",
    ESSAY = "ESSAY"
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
