import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type AutoSubmitStatus =
    | "waiting"
    | "submitting"
    | "failed"
    | "submitted"
    | "not_started"
    | "draft_missing";

export function ExpiredAttempt({
    contestId,
    status,
    error,
    submissionId,
    onRetry,
}: {
    contestId: string;
    status: AutoSubmitStatus;
    error: string;
    submissionId: string | null;
    onRetry: () => void;
}): ReactNode {
    return (
        <section className="panel form">
            <h1>Kỳ thi đã hết giờ</h1>
            {status === "failed" ? (
                <>
                    <p className="error" role="alert">
                        Không thể tự động nộp bài: {error}
                    </p>
                    <p>Bản nháp vẫn được giữ nếu trình duyệt đã lưu thành công.</p>
                    <button className="button primary" type="button" onClick={onRetry}>
                        Thử nộp lại
                    </button>
                </>
            ) : status === "submitted" ? (
                <>
                    <p role="status">Bạn đã nộp bài cho kỳ thi này.</p>
                    {submissionId && (
                        <Link className="button primary" to={`/submissions/${submissionId}`}>
                            Xem bài đã nộp
                        </Link>
                    )}
                </>
            ) : status === "not_started" ? (
                <p role="status">Kỳ thi đã kết thúc và bạn chưa bắt đầu làm bài.</p>
            ) : status === "draft_missing" ? (
                <p role="alert">
                    Có lượt làm bài chưa nộp, nhưng không tìm thấy bản nháp trên trình duyệt này.
                </p>
            ) : (
                <p role="status" aria-live="polite">
                    {status === "submitting" ? "Đang tự động nộp bài…" : "Đang kiểm tra lượt làm bài…"}
                </p>
            )}
            <Link className="button" to={`/contests/${contestId}`}>
                Về chi tiết kỳ thi
            </Link>
        </section>
    );
}
