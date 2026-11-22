import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import type { Group } from "../../../types";

export function GroupCard({ group }: { group: Group }): ReactNode {
    return (
        <Link to={`/groups/${group.id}`} className="card">
            <div className="card-top">
                <span className="card-icon">
                    <Users size={20} />
                </span>
                <span className="badge">
                    {group.visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}
                </span>
            </div>
            <h3>{group.name}</h3>
            <p>{group.description}</p>
            <div className="card-bottom">
                <span>Mã: {group.code}</span>
                <span>
                    {group.role === "VISITOR"
                        ? group.pending
                            ? "Đang chờ duyệt"
                            : "Xem nhóm →"
                        : group.role}
                </span>
            </div>
        </Link>
    );
}
