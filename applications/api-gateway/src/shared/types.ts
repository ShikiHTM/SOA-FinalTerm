export enum UserSystemRole {
    USER = "USER",
    ADMIN = "ADMIN"
}

export type AuthMode = "public" | "optional" | "required" | "admin";

export type ServiceKey =
    | "user"
    | "group"
    | "assessment"
    | "contest"
    | "submission"
    | "notification";

export interface VerifiedUser {
    userId: string;
    userRole: UserSystemRole;
    status: string;
}

export interface UserSummary {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    system_role: UserSystemRole;
    status: string;
}

export interface AppEnv {
    Variables: {
        user?: VerifiedUser;
        bearerToken?: string;
    };
}
