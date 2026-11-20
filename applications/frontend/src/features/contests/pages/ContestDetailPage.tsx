import {
    BookOpen,
    CalendarDays,
    ClipboardCheck,
    FileText,
    GraduationCap,
    Users
} from "lucide-react";
import { type ReactNode } from "react";
import { Link,useParams } from "react-router-dom";
import { date,hasAccess,useApp } from "../../../shared/context";
import type { Assessment,Contest,Group,Submission } from "../../../types";

export function ContestDetail(): ReactNode {
    const { contestId }: { contestId?: string } = useParams();
    const { data, email }: ReturnType<typeof useApp> = useApp();
    const contest: Contest | undefined = data.contests.find(
        (item): boolean => item.id === contestId,
    );
    const exam: Assessment | undefined = data.assessments.find(
        (item: Assessment): boolean => item.id === contest?.assessmentId,
    );
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === exam?.groupId,
    );
    if (!contest || !exam || !group || !hasAccess(group))
        return <p className="empty">Không xem được kỳ thi.</p>;
    const now: number = Date.now();
    const status: string =
        now < Date.parse(contest.startAt)
            ? "Sắp diễn ra"
            : now >= Date.parse(contest.endAt)
              ? "Đã kết thúc"
              : "Đang diễn ra";
    const submissions: Submission[] = data.submissions.filter(
        (item: Submission): boolean => item.contestId === contest.id && item.authorEmail === email,
    );
    const available: boolean =
        status === "Đang diễn ra" &&
        exam.source !== "PDF" &&
        (contest.policy === "MULTIPLE" || submissions.length === 0);
    return (
        <div className="contest-detail-page">
            <div className="assessment-breadcrumb">
                <Link to={`/groups/${group.id}`}>{group.name}</Link>
                <span>/</span>
                <span>Chi tiết kỳ thi</span>
            </div>
            <header className="assessment-hero">
                <span className="assessment-hero-icon">
                    <GraduationCap size={26} strokeWidth={1.7} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>KỲ THI CỦA NHÓM</span>
                        <span className="assessment-visibility">{status}</span>
                    </div>
                    <h1>{contest.title}</h1>
                    <p>{exam.title}</p>
                    <Link className="assessment-group-link" to={`/groups/${group.id}`}>
                        <Users size={15} /> {group.name}
                    </Link>
                </div>
            </header>
            <div className="assessment-workspace">
                <div className="contest-content">
                    <section className="assessment-section">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">THỜI GIAN & QUY ĐỊNH</p>
                                <h2>Thông tin kỳ thi</h2>
                                <p>Kiểm tra thời gian và số lượt nộp trước khi bắt đầu.</p>
                            </div>
                        </div>
                        <div className="contest-facts">
                            <div>
                                <span className="contest-fact-icon">
                                    <CalendarDays size={18} />
                                </span>
                                <span>
                                    <small>BẮT ĐẦU</small>
                                    <strong>{date(contest.startAt)}</strong>
                                </span>
                            </div>
                            <div>
                                <span className="contest-fact-icon">
                                    <CalendarDays size={18} />
                                </span>
                                <span>
                                    <small>KẾT THÚC</small>
                                    <strong>{date(contest.endAt)}</strong>
                                </span>
                            </div>
                            <div>
                                <span className="contest-fact-icon">
                                    <FileText size={18} />
                                </span>
                                <span>
                                    <small>LƯỢT NỘP</small>
                                    <strong>
                                        {contest.policy === "MULTIPLE"
                                            ? "Nhiều lần · tính bài cuối"
                                            : "Một lần"}
                                    </strong>
                                </span>
                            </div>
                        </div>
                    </section>
                    <section className="assessment-section">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">KẾT QUẢ CỦA BẠN</p>
                                <h2>Bài nộp của bạn</h2>
                                <p>Theo dõi các bài bạn đã nộp cho kỳ thi này.</p>
                            </div>
                            <span className="assessment-count">{submissions.length} bài nộp</span>
                        </div>
                        {submissions.length ? (
                            <div className="contest-submission-list">
                                {submissions.map(
                                    (item: Submission): ReactNode => (
                                        <Link
                                            className="contest-submission"
                                            to={`/submissions/${item.id}`}
                                            key={item.id}
                                        >
                                            <span className="contest-submission-icon">
                                                <ClipboardCheck size={18} />
                                            </span>
                                            <span>
                                                <strong>
                                                    {item.status === "GRADED"
                                                        ? `Đã chấm · ${item.score}/10`
                                                        : "Chờ chấm"}
                                                </strong>
                                                <small>Nộp lúc {date(item.submittedAt)}</small>
                                                {item.feedback && (
                                                    <small>Nhận xét: {item.feedback}</small>
                                                )}
                                            </span>
                                            <span className="contest-submission-link">Xem bài</span>
                                        </Link>
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="assessment-placeholder">
                                <ClipboardCheck size={21} />
                                <div>
                                    <strong>Chưa có bài nộp</strong>
                                    <p>Bài làm của bạn sẽ xuất hiện ở đây sau khi nộp.</p>
                                </div>
                            </div>
                        )}
                        <p className="contest-mock-hint">Kết quả chấm hiện là dữ liệu mô phỏng.</p>
                    </section>
                </div>
                <aside className="assessment-side">
                    <section className="assessment-section assessment-info">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">TỔNG QUAN</p>
                                <h2>Thông tin đề</h2>
                            </div>
                        </div>
                        <dl className="assessment-info-list">
                            <div>
                                <dt>Nhóm</dt>
                                <dd>{group.name}</dd>
                            </div>
                            <div>
                                <dt>Đề thi</dt>
                                <dd>{exam.title}</dd>
                            </div>
                            <div>
                                <dt>Số câu hỏi</dt>
                                <dd>{exam.questions.length} câu</dd>
                            </div>
                            <div>
                                <dt>Trạng thái</dt>
                                <dd>{status}</dd>
                            </div>
                        </dl>
                        <Link className="contest-exam-link" to={`/assessments/${exam.id}`}>
                            Xem chi tiết đề
                        </Link>
                    </section>
                    <section className="assessment-section assessment-start">
                        <span className="assessment-start-icon">
                            <BookOpen size={21} />
                        </span>
                        <h2>Sẵn sàng làm bài?</h2>
                        <p>
                            {available
                                ? "Bài làm sẽ được lưu tạm trên trình duyệt trong khi bạn thực hiện."
                                : "Kỳ thi chưa mở, đã kết thúc, hết lượt nộp hoặc PDF chưa khả dụng trong bản thử."}
                        </p>
                        {available && (
                            <Link
                                className="button primary assessment-practice-button"
                                to={`/contests/${contest.id}/attempt`}
                            >
                                Bắt đầu làm bài
                            </Link>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}
