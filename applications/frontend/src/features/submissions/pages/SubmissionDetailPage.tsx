import type { ReactNode } from "react";
import { Link,useParams } from "react-router-dom";
import { date,hasAccess,PageTitle,useApp } from "../../../shared/context";
import type { Question,Submission } from "../../../types";
import { findContext } from "../utils/findContext";
import type { SubmissionContext } from "../utils/findContext";

export function SubmissionDetail(): ReactNode {
    const { submissionId }: { submissionId?: string } = useParams();
    const { data, email }: ReturnType<typeof useApp> = useApp();
    const submission: Submission | undefined = data.submissions.find(
        (item: Submission): boolean => item.id === submissionId && item.authorEmail === email,
    );
    if (!submission)
        return (
            <>
                <Link className="back" to="/submissions">
                    ← Lịch sử bài nộp
                </Link>
                <p className="empty">Không tìm thấy bài nộp.</p>
            </>
        );
    const { contest, assessment, group }: SubmissionContext = findContext(
        submission,
        data.contests,
        data.assessments,
        data.groups,
    );
    if (!contest || !assessment || !group || !hasAccess(group))
        return (
            <>
                <Link className="back" to="/submissions">
                    ← Lịch sử bài nộp
                </Link>
                <p className="empty">Không thể xem chi tiết bài nộp hoặc nhóm liên quan.</p>
            </>
        );
    return (
        <>
            <Link className="back" to="/submissions">
                ← Lịch sử bài nộp
            </Link>
            <PageTitle
                label="BÀI NỘP CỦA BẠN"
                title={contest.title}
                description={`${assessment.title} · ${group.name}`}
            />
            <div className="columns">
                <section className="panel">
                    <h2>Thông tin bài nộp</h2>
                    <dl>
                        <dt>Thời gian nộp</dt>
                        <dd>{date(submission.submittedAt)}</dd>
                        <dt>Trạng thái</dt>
                        <dd>{submission.status === "GRADED" ? "Đã chấm" : "Chờ chấm"}</dd>
                        {submission.status === "GRADED" && (
                            <>
                                <dt>Điểm</dt>
                                <dd>{submission.score}/10</dd>
                                <dt>Nhận xét</dt>
                                <dd>{submission.feedback || "Chưa có nhận xét"}</dd>
                            </>
                        )}
                    </dl>
                    <Link className="button" to={`/contests/${contest.id}`}>
                        Xem kỳ thi
                    </Link>
                </section>
                <section className="panel">
                    <h2>Câu trả lời đã nộp</h2>
                    {assessment.questions.map(
                        (question: Question, index: number): ReactNode => (
                            <div className="preview-question" key={question.id}>
                                <span className="eyebrow">CÂU {index + 1}</span>
                                <p>
                                    <strong>{question.text || `Câu ${index + 1}`}</strong>
                                </p>
                                <p>
                                    {submission.answers[question.id]?.length
                                        ? submission.answers[question.id].join(", ")
                                        : "Chưa trả lời"}
                                </p>
                            </div>
                        ),
                    )}
                </section>
            </div>
        </>
    );
}
