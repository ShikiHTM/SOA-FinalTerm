import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useParams } from "react-router-dom";
import { groupsApi } from "../../../api/client";
import type { GroupSummary } from "../../../api/types";
import { hasGroupPermission } from "../../../authorization/permissions";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { groupRoleOf } from "../../../shared/context";
import { GroupManagement } from "../components/GroupManagement";

export function GroupSettingsPage(): ReactNode {
    const { groupId }: { groupId?: string } = useParams();
    const [group, setGroup]: [GroupSummary | null, Dispatch<SetStateAction<GroupSummary | null>>] =
        useState<GroupSummary | null>(null);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const reloadGroup: () => Promise<void> = useCallback(async (): Promise<void> => {
        if (!groupId) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            setGroup(await groupsApi.getById(groupId));
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load group settings."));
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect((): void => {
        void reloadGroup();
    }, [reloadGroup]);

    if (loading && !group) {
        return <p className="muted">Loading group settings...</p>;
    }
    if (!group || !hasGroupPermission(groupRoleOf(group), "MANAGE_MEMBERS")) {
        return (
            <div className="page-enter">
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <p className="empty">Group not found or insufficient management permissions.</p>
            </div>
        );
    }

    return (
        <div className="group-detail-page page-enter">
            <Link className="group-breadcrumb" to={`/groups/${group.id}`}>
                {group.name} <span>/</span> Settings
            </Link>
            <GroupManagement group={group} onUpdated={reloadGroup} key={group.id} />
        </div>
    );
}
