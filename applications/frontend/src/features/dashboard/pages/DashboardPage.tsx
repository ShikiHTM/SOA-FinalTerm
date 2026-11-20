import {
    BookOpen,
    FileText,
    GraduationCap,
    LockKeyhole,
    Search
} from "lucide-react";
import type { Dispatch,SetStateAction } from "react";
import { useState,type ReactNode } from "react";
import { Link } from "react-router-dom";
import { hasAccess,useApp } from "../../../shared/context";
import { normalizeSearch } from "../../../shared/utils/search";
import type { Assessment,Group } from "../../../types";

export function Dashboard(): ReactNode {
    const { data, email }: ReturnType<typeof useApp> = useApp();
    const [query, setQuery]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [filter, setFilter]: [
        "ALL" | "PUBLIC" | "PRIVATE",
        Dispatch<SetStateAction<"ALL" | "PUBLIC" | "PRIVATE">>,
    ] = useState<"ALL" | "PUBLIC" | "PRIVATE">("ALL");
    const term: string = normalizeSearch(query);
    const memberCount: number = data.groups.filter(
        (group: Group): boolean => group.role !== "VISITOR",
    ).length;
    const exams: Assessment[] = data.assessments.filter((exam: Assessment): boolean => {
        const group: Group | undefined = data.groups.find(
            (item: Group): boolean => item.id === exam.groupId,
        );
        if (!group || (filter !== "ALL" && group.visibility !== filter)) return false;
        return (
            !term ||
            normalizeSearch(exam.title).includes(term) ||
            normalizeSearch(group.name).includes(term)
        );
    });

    return (
        <div className="dashboard">
            <section className="dashboard-welcome" aria-label="Tổng quan học tập">
                <div className="welcome-copy">
                    <p className="welcome-kicker">
                        <span /> KHÔNG GIAN HỌC TẬP CỦA BẠN
                    </p>
                    <h1>
                        Xin chào, <span>{email.split("@")[0]}</span>
                    </h1>
                    <p>Hôm nay bạn muốn học điều gì? Khám phá một đề phù hợp và bắt đầu nhé.</p>
                </div>
                <div className="welcome-summary" aria-label="Tổng quan">
                    <span className="summary-icon">
                        <GraduationCap size={23} />
                    </span>
                    <div>
                        <strong>{memberCount}</strong>
                        <span>nhóm đang tham gia</span>
                    </div>
                </div>
            </section>

            <section className="discover-section" aria-labelledby="discover-title">
                <div className="discover-heading">
                    <div>
                        <p className="eyebrow">THƯ VIỆN CỘNG ĐỒNG</p>
                        <h2 id="discover-title">Khám phá đề thi</h2>
                        <p>Chọn một đề và bắt đầu hành trình học tập của bạn.</p>
                    </div>
                    <span className="result-count">{exams.length} đề thi</span>
                </div>
                <div className="discover-controls">
                    <label className="home-search-field">
                        <Search size={19} aria-hidden="true" />
                        <input
                            type="search"
                            aria-label="Tìm đề theo tên đề hoặc tên nhóm"
                            placeholder="Tìm tên đề hoặc nhóm học tập"
                            value={query}
                            onChange={(event): void => setQuery(event.target.value)}
                        />
                    </label>
                    <div className="exam-filters" aria-label="Lọc đề theo phạm vi">
                        <button
                            type="button"
                            aria-pressed={filter === "ALL"}
                            className={filter === "ALL" ? "selected" : ""}
                            onClick={(): void => setFilter("ALL")}
                        >
                            Tất cả
                        </button>
                        <button
                            type="button"
                            aria-pressed={filter === "PUBLIC"}
                            className={filter === "PUBLIC" ? "selected" : ""}
                            onClick={(): void => setFilter("PUBLIC")}
                        >
                            Công khai
                        </button>
                        <button
                            type="button"
                            aria-pressed={filter === "PRIVATE"}
                            className={filter === "PRIVATE" ? "selected" : ""}
                            onClick={(): void => setFilter("PRIVATE")}
                        >
                            Riêng tư
                        </button>
                    </div>
                </div>
                <p className="discover-hint">
                    Đề riêng tư yêu cầu bạn tham gia nhóm trước khi làm bài.
                </p>
                {exams.length === 0 ? (
                    <div className="empty dashboard-empty">
                        <Search size={23} />
                        <h3>Không tìm thấy đề phù hợp</h3>
                        <p>Thử một từ khóa hoặc bộ lọc khác nhé.</p>
                    </div>
                ) : (
                    <div className="grid exam-grid">
                        {exams.map((exam: Assessment): ReactNode => {
                            const group: Group | undefined = data.groups.find(
                                (item: Group): boolean => item.id === exam.groupId,
                            );
                            if (!group) return null;
                            const locked: boolean = !hasAccess(group);
                            return (
                                <Link
                                    className="exam-card"
                                    key={exam.id}
                                    to={`/assessments/${exam.id}`}
                                >
                                    <div className="exam-card-top">
                                        <span
                                            className={`exam-icon ${group.visibility === "PRIVATE" ? "exam-icon-private" : ""}`}
                                        >
                                            <BookOpen size={20} />
                                        </span>
                                        <span
                                            className={`exam-visibility ${group.visibility === "PRIVATE" ? "visibility-private" : ""}`}
                                        >
                                            {group.visibility === "PRIVATE" && (
                                                <LockKeyhole size={12} />
                                            )}
                                            {group.visibility === "PUBLIC"
                                                ? "Công khai"
                                                : "Riêng tư"}
                                        </span>
                                    </div>
                                    <div className="exam-card-body">
                                        <h3>{exam.title}</h3>
                                        <p>
                                            {exam.description ||
                                                "Khám phá nội dung và bắt đầu học tập."}
                                        </p>
                                    </div>
                                    <div className="exam-group">
                                        <span className="group-monogram">
                                            {group.name.charAt(0).toUpperCase()}
                                        </span>
                                        <span>{group.name}</span>
                                    </div>
                                    <div className="exam-card-footer">
                                        <span>
                                            <FileText size={15} /> {exam.questions.length} câu hỏi
                                        </span>
                                        <strong>
                                            {locked ? "Yêu cầu tham gia" : "Xem chi tiết"}
                                        </strong>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
