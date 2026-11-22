import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { hasGroupPermission } from "../../../authorization/permissions";
import { useApp } from "../../../shared/context";
import type { Group } from "../../../types";
import { GroupManagement } from "../components/GroupManagement";

export function GroupSettingsPage(): ReactNode {
    const { groupId }: { groupId?: string } = useParams();
    const { data }: ReturnType<typeof useApp> = useApp();
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === groupId,
    );

    if (!group || !hasGroupPermission(group.role, "MANAGE_MEMBERS")) {
        return <p className="empty">Không tìm thấy nhóm hoặc bạn không có quyền quản lý.</p>;
    }

    return (
        <div className="group-detail-page">
            <Link className="group-breadcrumb" to={`/groups/${group.id}`}>
                {group.name} <span>/</span> Cài đặt
            </Link>
            <GroupManagement group={group} key={group.id} />
        </div>
    );
}
