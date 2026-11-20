import {
    GraduationCap,
    Plus
} from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { date,hasAccess,PageTitle,useApp } from "../../../shared/context";
import type { Assessment,Group } from "../../../types";

export function Contests(): ReactNode {
    const { data }: ReturnType<typeof useApp> = useApp();
    return (
        <>
            <PageTitle
                label="THỬ THÁCH BẢN THÂN"
                title="Kỳ thi & bài nộp"
                description="Xem lịch thi và bài nộp thử nghiệm."
                action={
                    <Link className="button primary" to="/contests/new">
                        <Plus size={16} /> Tạo kỳ thi
                    </Link>
                }
            />
            <div className="grid">
                {data.contests.map((contest): ReactNode => {
                    const exam: Assessment | undefined = data.assessments.find(
                        (item: Assessment): boolean => item.id === contest.assessmentId,
                    );
                    const group: Group | undefined = data.groups.find(
                        (item: Group): boolean => item.id === exam?.groupId,
                    );
                    if (!group || !hasAccess(group)) return null;
                    return (
                        <Link className="card" to={`/contests/${contest.id}`} key={contest.id}>
                            <div className="card-top">
                                <span className="card-icon">
                                    <GraduationCap size={20} />
                                </span>
                                <span className="badge">
                                    {Date.now() < Date.parse(contest.startAt)
                                        ? "Sắp diễn ra"
                                        : Date.now() >= Date.parse(contest.endAt)
                                          ? "Đã kết thúc"
                                          : "Đang diễn ra"}
                                </span>
                            </div>
                            <h3>{contest.title}</h3>
                            <p>{group.name}</p>
                            <div className="card-bottom">
                                <span>{date(contest.endAt)}</span>
                                <span>Xem chi tiết →</span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </>
    );
}
