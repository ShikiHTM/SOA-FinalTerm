import {
    Plus
} from "lucide-react";
import type { Dispatch,SetStateAction } from "react";
import { useState,type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageTitle,useApp } from "../../../shared/context";
import { normalizeSearch } from "../../../shared/utils/search";
import type { Group } from "../../../types";
import { GroupCard } from "../components/GroupCard";

export function Groups(): ReactNode {
    const { data }: ReturnType<typeof useApp> = useApp();
    const [query, setQuery]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [section, setSection]: [
        "discover" | "mine",
        Dispatch<SetStateAction<"discover" | "mine">>,
    ] = useState<"discover" | "mine">("discover");
    const term: string = normalizeSearch(query);
    const groups: Group[] = data.groups.filter((group: Group): boolean => {
        const member: boolean = group.role !== "VISITOR";
        const codeMatches: boolean = !!term && normalizeSearch(group.code) === term;
        const visible: boolean = section === "mine" ? member : !member;
        const matches: boolean = !term || normalizeSearch(group.name).includes(term) || codeMatches;
        return visible && matches;
    });
    return (
        <>
            <PageTitle
                label="CỘNG ĐỒNG"
                title="Nhóm học tập"
                description="Tìm cộng đồng học tập và quản lý các nhóm bạn tham gia."
                action={
                    <Link className="button primary" to="/groups/new">
                        <Plus size={16} /> Tạo nhóm
                    </Link>
                }
            />
            <div className="toolbar groups-toolbar">
                <div className="tabs" aria-label="Danh mục nhóm">
                    <button
                        type="button"
                        className={section === "discover" ? "active" : ""}
                        aria-pressed={section === "discover"}
                        onClick={(): void => setSection("discover")}
                    >
                        Khám phá
                    </button>
                    <button
                        type="button"
                        className={section === "mine" ? "active" : ""}
                        aria-pressed={section === "mine"}
                        onClick={(): void => setSection("mine")}
                    >
                        Nhóm của tôi
                    </button>
                </div>
                <input
                    className="search groups-search"
                    type="search"
                    aria-label="Tìm theo tên hoặc mã nhóm"
                    placeholder="Tìm theo tên hoặc mã nhóm"
                    value={query}
                    onChange={(event): void => setQuery(event.target.value)}
                />
            </div>
            <p className="groups-hint">
                {section === "discover"
                    ? "Các nhóm công khai và riêng tư bạn chưa tham gia. Với User thông thường, nội dung riêng tư chỉ dành cho thành viên."
                    : "Các nhóm bạn là thành viên hoặc Owner của nhóm."}
            </p>
            {groups.length ? (
                <div className="grid">
                    {groups.map(
                        (group: Group): ReactNode => (
                            <GroupCard key={group.id} group={group} />
                        ),
                    )}
                </div>
            ) : (
                <p className="empty">
                    {term
                        ? "Không tìm thấy nhóm phù hợp."
                        : section === "mine"
                          ? "Bạn chưa tham gia hoặc quản lý nhóm nào."
                          : "Chưa có nhóm để khám phá."}
                </p>
            )}
        </>
    );
}
