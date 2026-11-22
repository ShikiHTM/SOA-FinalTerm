import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Globe2, LockKeyhole, Users } from "lucide-react";
import type { GroupSummary } from "../../../api/types";

export function GroupCard({ group }: { group: GroupSummary }): ReactNode {
    return (
        <Link to={`/groups/${group.id}`} className="resource-row">
            <span className="resource-row-icon">
                <Users size={18} />
            </span>
            <div className="resource-row-main">
                <div className="resource-row-title">
                    <strong>{group.name}</strong>
                    <span className="badge">
                        {group.visibility === "PUBLIC" ? (
                            <Globe2 size={12} />
                        ) : (
                            <LockKeyhole size={12} />
                        )}
                        {group.visibility}
                    </span>
                    {group.my_role && <span className="badge badge-dark">{group.my_role}</span>}
                </div>
                <p>{group.description || "Collaborative study group."}</p>
                <div className="resource-row-meta">
                    <span>Code: {group.group_code}</span>
                    <span>{group.member_count} members</span>
                    <span>Policy: {group.join_policy}</span>
                    {group.owner && <span>Owner: {group.owner.display_name}</span>}
                </div>
            </div>
            <span className="resource-row-cta">
                {group.my_role ? "Open group" : "View group"} <ArrowRight size={14} />
            </span>
        </Link>
    );
}
