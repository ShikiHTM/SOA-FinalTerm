import type { GroupRole } from "../api/types";

export type GroupPermission =
    | "VIEW_PRIVATE_CONTENT"
    | "MANAGE_CONTENT"
    | "MANAGE_MEMBERS"
    | "MANAGE_SETTINGS"
    | "ASSIGN_MODERATOR"
    | "TRANSFER_OWNERSHIP"
    | "DELETE_GROUP";

export type SystemRole = "GUEST" | "USER" | "ADMIN";
export type SystemPermission = "ACCESS_ADMIN";

const GROUP_PERMISSIONS: Record<GroupRole, readonly GroupPermission[]> = {
    VISITOR: [],
    MEMBER: ["VIEW_PRIVATE_CONTENT"],
    MODERATOR: ["VIEW_PRIVATE_CONTENT", "MANAGE_CONTENT", "MANAGE_MEMBERS"],
    OWNER: [
        "VIEW_PRIVATE_CONTENT",
        "MANAGE_CONTENT",
        "MANAGE_MEMBERS",
        "MANAGE_SETTINGS",
        "ASSIGN_MODERATOR",
        "TRANSFER_OWNERSHIP",
        "DELETE_GROUP"
    ]
};

const SYSTEM_PERMISSIONS: Record<SystemRole, readonly SystemPermission[]> = {
    GUEST: [],
    USER: [],
    ADMIN: ["ACCESS_ADMIN"]
};

export function hasGroupPermission(role: GroupRole, permission: GroupPermission): boolean {
    return GROUP_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasSystemPermission(role: SystemRole, permission: SystemPermission): boolean {
    return SYSTEM_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canViewGroupContent(
    visibility: "PUBLIC" | "PRIVATE",
    role: GroupRole
): boolean {
    return visibility === "PUBLIC" || hasGroupPermission(role, "VIEW_PRIVATE_CONTENT");
}

export function canManageMember(actor: GroupRole, target: GroupRole): boolean {
    return (
        hasGroupPermission(actor, "MANAGE_MEMBERS") &&
        (target === "MEMBER" || (target === "MODERATOR" && actor === "OWNER"))
    );
}
