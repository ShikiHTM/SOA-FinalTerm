import { ClipboardList } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { date,hasAccess,PageTitle,useApp } from "../../../shared/context";
import type { Submission } from "../../../types";
import { findContext } from "../utils/findContext";
import type { SubmissionContext } from "../utils/findContext";

export function SubmissionHistory(): ReactNode {
    const { data, email }: ReturnType<typeof useApp> = useApp();
    const submissions: Submission[] = data.submissions
        .filter((item: Submission): boolean => item.authorEmail === email)
        .sort(
            (first: Submission, second: Submission): number =>
                Date.parse(second.submittedAt) - Date.parse(first.submittedAt),
        );
    return (
        <>
            <PageTitle
                label="HOẠT ĐỘNG CỦA BẠN"
                title="Lịch sử bài nộp"
                description="Xem lại các bài bạn đã nộp trong các kỳ thi."
            />
            {submissions.length === 0 ? (
                <div className="empty">
                    <p>Bạn chưa có bài nộp nào.</p>
                    <p>Hãy tham gia một kỳ thi để bắt đầu.</p>
                    <Link className="button" to="/groups">
                        Khám phá nhóm
                    </Link>
                </div>
            ) : (
                <div className="history-list">
                    {submissions.map((submission: Submission): ReactNode => {
                        const { contest, assessment, group }: SubmissionContext = findContext(
                            submission,
                            data.contests,
                            data.assessments,
                            data.groups,
                        );
                        if (!contest || !assessment || !group || !hasAccess(group)) {
                            return (
                                <article
                                    className="history-card history-unavailable"
                                    key={submission.id}
                                >
                                    <ClipboardList size={20} />
                                    <div>
                                        <strong>Bài nộp không còn khả dụng</strong>
                                        <p>{date(submission.submittedAt)}</p>
                                        <p>Không thể xem chi tiết bài nộp hoặc nhóm liên quan.</p>
                                    </div>
                                </article>
                            );
                        }
                        return (
                            <Link
                                className="history-card"
                                key={submission.id}
                                to={`/submissions/${submission.id}`}
                            >
                                <span className="card-icon">
                                    <ClipboardList size={20} />
                                </span>
                                <div className="history-info">
                                    <h3>{contest.title}</h3>
                                    <p>
                                        {assessment.title} · {group.name}
                                    </p>
                                    <p>Nộp lúc {date(submission.submittedAt)}</p>
                                </div>
                                <div className="history-status">
                                    <span
                                        className={`badge ${submission.status === "GRADED" ? "badge-success" : "badge-warning"}`}
                                    >
                                        {submission.status === "GRADED"
                                            ? `Đã chấm: ${submission.score}/10`
                                            : "Chờ chấm"}
                                    </span>
                                    <span>Xem bài →</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </>
    );
}
