import {
    BookOpen,
    Plus
} from "lucide-react";
import type { Dispatch,SetStateAction } from "react";
import { useState,type ReactNode } from "react";
import { Link } from "react-router-dom";
import { hasAccess,PageTitle,useApp } from "../../../shared/context";
import type { Assessment,Group } from "../../../types";

export function Assessments(): ReactNode {
    const { data }: ReturnType<typeof useApp> = useApp();
    const [query, setQuery]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const exams: Assessment[] = data.assessments.filter((item: Assessment): boolean => {
        const group: Group | undefined = data.groups.find(
            (g: Group): boolean => g.id === item.groupId,
        );
        return (
            !!group && hasAccess(group) && item.title.toLowerCase().includes(query.toLowerCase())
        );
    });
    return (
        <>
            <PageTitle
                label="THƯ VIỆN HỌC TẬP"
                title="Đề thi & luyện tập"
                description="Mỗi đề đều thuộc về một nhóm."
                action={
                    <Link className="button primary" to="/assessments/new">
                        <Plus size={16} /> Tạo đề
                    </Link>
                }
            />
            <input
                className="search"
                placeholder="Tìm đề thi"
                value={query}
                onChange={(event): void => setQuery(event.target.value)}
            />
            <div className="grid">
                {exams.map(
                    (exam: Assessment): ReactNode => (
                        <Link key={exam.id} to={`/assessments/${exam.id}`} className="card">
                            <div className="card-top">
                                <span className="card-icon">
                                    <BookOpen size={20} />
                                </span>
                                <span className="badge">
                                    {exam.source === "PDF" ? "PDF" : "Nhập trực tiếp"}
                                </span>
                            </div>
                            <h3>{exam.title}</h3>
                            <p>{exam.description}</p>
                            <div className="card-bottom">
                                <span>
                                    {
                                        data.groups.find(
                                            (group: Group): boolean => group.id === exam.groupId,
                                        )?.name
                                    }
                                </span>
                                <span>{exam.questions.length} câu →</span>
                            </div>
                        </Link>
                    ),
                )}
            </div>
            {!exams.length && <p className="empty">Không có đề phù hợp.</p>}
        </>
    );
}
