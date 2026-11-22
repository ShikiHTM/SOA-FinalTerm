import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { GroupRole, GroupSummary, OwnUserProfile } from "../api/types";
import { canViewGroupContent, hasGroupPermission } from "../authorization/permissions";

export type AppContext = {
    user: OwnUserProfile;
    unreadCount: number;
    refreshUser: () => Promise<void>;
    refreshNotifications: () => Promise<void>;
    onLogout: () => Promise<void>;
};

export function useApp(): AppContext {
    return useOutletContext<AppContext>();
}

export function groupRoleOf(group: Pick<GroupSummary, "my_role">): GroupRole {
    return group.my_role ?? "VISITOR";
}

export function hasAccess(group: Pick<GroupSummary, "visibility" | "my_role">): boolean {
    return canViewGroupContent(group.visibility, groupRoleOf(group));
}

export function canManage(
    group: Pick<GroupSummary, "my_role">,
    systemRole?: OwnUserProfile["system_role"]
): boolean {
    return systemRole === "ADMIN" || hasGroupPermission(groupRoleOf(group), "MANAGE_CONTENT");
}

export function formatDate(value: string): string {
    return new Date(value).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

export function formatShortDate(value: string): string {
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

export function PageTitle({
    label,
    title,
    description,
    action
}: {
    label: string;
    title: string;
    description: string;
    action?: ReactNode;
}): ReactNode {
    return (
        <div className="page-title">
            <div>
                <p className="eyebrow">{label}</p>
                <h1>{title}</h1>
                <p className="muted">{description}</p>
            </div>
            {action}
        </div>
    );
}
