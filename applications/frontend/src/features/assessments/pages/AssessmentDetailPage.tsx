import {
    BookOpen,
    FileText,
    Globe2,
    GraduationCap,
    LockKeyhole,
    Play,
    Users
} from "lucide-react";
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Link,useNavigate,useParams } from "react-router-dom";
import { canManage,hasAccess,useApp } from "../../../shared/context";
import type { Assessment,Group,Question } from "../../../types";

export function AssessmentDetail(): ReactNode {
    const { assessmentId }: { assessmentId?: string } = useParams();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const { data, api, refresh }: ReturnType<typeof useApp> = useApp();
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const exam: Assessment | undefined = data.assessments.find(
        (item: Assessment): boolean => item.id === assessmentId,
    );
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === exam?.groupId,
    );
    if (!exam || !group) return <p className="empty">Không tìm thấy đề này.</p>;

    async function toggleFavorite(): Promise<void> {
        try {
            if (!exam) return;
            await api.toggleFavorite(exam.id);
            await refresh();
            setError("");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể cập nhật đề yêu thích.");
        }
    }
    async function deleteAssessment(): Promise<void> {
        if (!exam || !group || !window.confirm("Xóa đề này cùng các kỳ thi và bài nộp liên quan? Không thể hoàn tác.")) return;
        try {
            await api.deleteAssessment(exam.id);
            await refresh();
            navigate(`/groups/${group.id}`);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể xóa đề.");
        }
    }

    const accessible: boolean = hasAccess(group);
    const canPractice: boolean =
        accessible && exam.source === "DIRECT" && (group.visibility === "PUBLIC" || exam.practice);
    const totalPoints: number = exam.questions.reduce(
        (total: number, question: Question): number => total + question.points,
        0,
    );

    return (
        <div className="assessment-detail-page">
            <div className="assessment-breadcrumb">
                <Link to="/">Trang chủ</Link>
                <span>/</span>
                <span>Chi tiết đề</span>
            </div>
            <header className="assessment-hero">
                <span className="assessment-hero-icon">
                    <BookOpen size={26} strokeWidth={1.7} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>ĐỀ THI</span>
                        <span className="assessment-visibility">
                            {group.visibility === "PRIVATE" ? (
                                <LockKeyhole size={13} />
                            ) : (
                                <Globe2 size={13} />
                            )}
                            {group.visibility === "PRIVATE" ? "Riêng tư" : "Công khai"}
                        </span>
                    </div>
                    <h1>{exam.title}</h1>
                    <p>{exam.description || "Khám phá nội dung và bắt đầu học tập."}</p>
                    <Link className="assessment-group-link" to={`/groups/${group.id}`}>
                        <Users size={15} /> {group.name}
                    </Link>
                </div>
            </header>
            <div className="assessment-breadcrumb">
                <button className="button" type="button" onClick={(): void => { void toggleFavorite(); }}>
                    {data.favoriteAssessmentIds.includes(exam.id) ? "Bỏ yêu thích" : "Lưu yêu thích"}
                </button>
                <Link to="/favorites">Đề yêu thích</Link>
                {canManage(group) && (
                    <>
                        <Link className="button" to={`/assessments/${exam.id}/edit`}>Chỉnh sửa đề</Link>
                        <button className="button" type="button" onClick={(): void => { void deleteAssessment(); }}>Xóa đề</button>
                    </>
                )}
            </div>
            {error && <p className="error" role="alert">{error}</p>}

            {!accessible ? (
                <section className="assessment-locked">
                    <span className="assessment-locked-icon">
                        <LockKeyhole size={22} />
                    </span>
                    <div>
                        <p className="assessment-section-kicker">ĐỀ THUỘC NHÓM RIÊNG TƯ</p>
                        <h2>Tham gia nhóm để làm bài</h2>
                        <p>
                            {group.pending
                                ? `Yêu cầu tham gia nhóm ${group.name} đang chờ chủ nhóm phê duyệt.`
                                : `Bạn cần tham gia nhóm ${group.name} để xem câu hỏi và làm bài.`}
                        </p>
                        <Link className="button primary" to={`/groups/${group.id}`}>
                            {group.pending ? "Xem trạng thái yêu cầu" : "Xem và tham gia nhóm"}
                        </Link>
                    </div>
                </section>
            ) : (
                <div className="assessment-workspace">
                    <section className="assessment-section assessment-questions">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">NỘI DUNG ĐỀ THI</p>
                                <h2>Câu hỏi</h2>
                                <p>Khám phá nội dung của bộ đề này.</p>
                            </div>
                            <span className="assessment-count">
                                {exam.questions.length} câu hỏi
                            </span>
                        </div>
                        {exam.source === "PDF" ? (
                            <div className="assessment-placeholder">
                                <FileText size={21} />
                                <div>
                                    <strong>Nội dung đề PDF</strong>
                                    <p>
                                        Tệp chưa được tải lên và chưa thể mở trong bản thử nghiệm.
                                    </p>
                                </div>
                            </div>
                        ) : exam.questions.length ? (
                            <div className="assessment-question-list">
                                {exam.questions.map(
                                    (question: Question, index: number): ReactNode => (
                                        <article className="assessment-question" key={question.id}>
                                            <span className="assessment-question-number">
                                                {String(index + 1).padStart(2, "0")}
                                            </span>
                                            <div className="assessment-question-content">
                                                <div className="assessment-question-meta">
                                                    <span>CÂU {index + 1}</span>
                                                    <span>{question.points} ĐIỂM</span>
                                                </div>
                                                <h3>{question.text}</h3>
                                            </div>
                                        </article>
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="assessment-placeholder">
                                <BookOpen size={21} />
                                <div>
                                    <strong>Chưa có câu hỏi</strong>
                                    <p>Câu hỏi sẽ xuất hiện ở đây khi đề được cập nhật.</p>
                                </div>
                            </div>
                        )}
                    </section>
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
                                    <dt>Phạm vi</dt>
                                    <dd>
                                        {group.visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Loại đề</dt>
                                    <dd>{exam.source === "PDF" ? "PDF" : "Trực tuyến"}</dd>
                                </div>
                                <div>
                                    <dt>Số câu hỏi</dt>
                                    <dd>{exam.questions.length} câu</dd>
                                </div>
                                <div>
                                    <dt>Tổng điểm</dt>
                                    <dd>{totalPoints} điểm</dd>
                                </div>
                                <div>
                                    <dt>Luyện tập</dt>
                                    <dd>
                                        {exam.source === "PDF"
                                            ? "Chưa hỗ trợ"
                                            : group.visibility === "PUBLIC" || exam.practice
                                              ? "Được phép"
                                              : "Chưa mở"}
                                    </dd>
                                </div>
                            </dl>
                        </section>
                        <section className="assessment-section assessment-start">
                            <span className="assessment-start-icon">
                                <GraduationCap size={21} />
                            </span>
                            <h2>Sẵn sàng luyện tập?</h2>
                            <p>
                                {exam.source === "PDF"
                                    ? "Đề PDF chưa hỗ trợ làm bài trong bản thử nghiệm."
                                    : canPractice
                                      ? "Bắt đầu làm bài theo tốc độ của bạn."
                                      : "Chủ nhóm chưa mở chế độ luyện tập cho đề này."}
                            </p>
                            {canPractice && (
                                <Link
                                    className="button primary assessment-practice-button"
                                    to={`/assessments/${exam.id}/practice`}
                                >
                                    <Play size={16} fill="currentColor" /> Bắt đầu luyện tập
                                </Link>
                            )}
                            <Link className="assessment-back-group" to={`/groups/${group.id}`}>
                                Xem nhóm học tập
                            </Link>
                        </section>
                    </aside>
                </div>
            )}
        </div>
    );
}
