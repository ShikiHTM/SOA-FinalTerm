import type { Dispatch,SetStateAction } from "react";
import { useState,type FormEvent,type ReactNode } from "react";
import { Link,useParams } from "react-router-dom";
import { canManage,date,PageTitle,useApp } from "../../../shared/context";
import type { Assessment,Contest,Group,Question,Submission } from "../../../types";

export function Grading(): ReactNode {
    const { data, api, refresh }: ReturnType<typeof useApp> = useApp();
    const { groupId }: { groupId?: string } = useParams();
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === groupId,
    );
    const [selected, setSelected]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [score, setScore]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [feedback, setFeedback]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const submissions: Submission[] = data.submissions.filter((submission: Submission): boolean => {
        const contest: Contest | undefined = data.contests.find(
            (item: Contest): boolean => item.id === submission.contestId,
        );
        if (
            contest?.policy === "MULTIPLE" &&
            data.submissions.find(
                (item: Submission): boolean =>
                    item.contestId === contest.id && item.authorEmail === submission.authorEmail,
            )?.id !== submission.id
        )
            return false;
        const exam: Assessment | undefined = data.assessments.find(
            (item: Assessment): boolean => item.id === contest?.assessmentId,
        );
        return !!group && canManage(group) && group.id === exam?.groupId;
    });
    const current: Submission | undefined = submissions.find(
        (item: Submission): boolean => item.id === selected,
    );
    async function save(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            if (!score.trim()) throw new Error("Nhập điểm từ 0 đến 10.");
            await api.grade(selected, Number(score), feedback);
            await refresh();
            setSelected("");
            setScore("");
            setFeedback("");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không lưu được điểm.");
        }
    }
    if (!group || !canManage(group))
        return <p className="empty">Bạn không có quyền chấm bài trong nhóm này.</p>;
    return (
        <>
            <Link className="back" to={`/groups/${group.id}`}>
                ← Nhóm {group.name}
            </Link>
            <PageTitle
                label="QUẢN LÝ BÀI LÀM"
                title="Chấm bài"
                description={`Chấm thử bài nộp trong nhóm ${group.name}.`}
            />
            {!submissions.length ? (
                <p className="empty">Chưa có bài cần chấm. Hãy thử nộp bài ở kỳ thi mẫu.</p>
            ) : (
                <div className="panel">
                    {submissions.map(
                        (submission: Submission): ReactNode => (
                            <div className="request-row" key={submission.id}>
                                <div>
                                    <strong>
                                        {
                                            data.contests.find(
                                                (item: Contest): boolean =>
                                                    item.id === submission.contestId,
                                            )?.title
                                        }
                                    </strong>
                                    <p className="hint">Người nộp: {submission.authorEmail}</p>
                                    <p className="hint">
                                        {date(submission.submittedAt)} ·{" "}
                                        {submission.status === "GRADED"
                                            ? `Đã chấm ${submission.score}/10`
                                            : "Chờ chấm"}
                                    </p>
                                </div>
                                <button
                                    className="button"
                                    onClick={(): void => {
                                        setSelected(submission.id);
                                        setScore(submission.score?.toString() ?? "");
                                        setFeedback(submission.feedback ?? "");
                                        setError("");
                                    }}
                                >
                                    Xem bài
                                </button>
                            </div>
                        ),
                    )}
                </div>
            )}
            {current && (
                <form
                    className="panel form space editor"
                    onSubmit={(event): void => {
                        void save(event);
                    }}
                >
                    <h2>Bài làm thử nghiệm</h2>
                    {Object.entries(current.answers).map(
                        ([questionId, answer]): ReactNode => (
                            <p key={questionId}>
                                <strong>
                                    {data.assessments
                                        .flatMap((item: Assessment): Question[] => item.questions)
                                        .find((item: Question): boolean => item.id === questionId)
                                        ?.text ?? questionId}
                                    :
                                </strong>{" "}
                                {answer.join(", ")}
                            </p>
                        ),
                    )}
                    <label>
                        Điểm thủ công (0–10)
                        <input
                            type="number"
                            required
                            min="0"
                            max="10"
                            step="0.1"
                            value={score}
                            onChange={(event): void => setScore(event.target.value)}
                        />
                    </label>
                    <label>
                        Nhận xét
                        <textarea
                            rows={3}
                            value={feedback}
                            onChange={(event): void => setFeedback(event.target.value)}
                        />
                    </label>
                    <p className="hint">Chưa có chấm tự động hoặc tổng hợp điểm từ backend.</p>
                    {error && <p className="error">{error}</p>}
                    <button className="button primary">Lưu kết quả thử nghiệm</button>
                </form>
            )}
        </>
    );
}
