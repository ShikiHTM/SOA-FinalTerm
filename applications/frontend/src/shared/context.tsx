import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { canViewGroupContent, hasGroupPermission } from "../authorization/permissions";
import type { DataSource } from "../data/contracts/dataSource";
import type { Account } from "../data/contracts/services";
import type { Group, Snapshot } from "../types";
export type Context = {
    data: Snapshot;
    api: DataSource;
    refresh: () => Promise<void>;
    accounts: Account[];
    displayName: string;
    refreshProfile: () => Promise<void>;
    email: string;
};
export function useApp(): Context {
    return useOutletContext<Context>();
}
export function displayNameFor(accounts: Account[], email: string): string {
    return accounts.find((account: Account): boolean => account.email === email)?.displayName ?? email;
}
export function hasAccess(group: Group): boolean {
    return canViewGroupContent(group.visibility, group.role);
}
export function canManage(group: Group): boolean {
    return hasGroupPermission(group.role, "MANAGE_CONTENT");
}
export function date(value: string): string {
    return new Date(value).toLocaleString("vi-VN");
}
export function PageTitle({
    label,
    title,
    description,
    action,
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
