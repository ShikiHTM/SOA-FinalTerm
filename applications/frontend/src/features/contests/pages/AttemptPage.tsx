import {
    FileText
} from "lucide-react";
import type { Dispatch,SetStateAction } from "react";
import { useEffect,useState,type ReactNode } from "react";
import { Link,useNavigate,useParams } from "react-router-dom";
import { date,hasAccess,useApp } from "../../../shared/context";
import type { Assessment,Contest,Group,Question } from "../../../types";

export function Attempt(): ReactNode {
    const { contestId }: { contestId?: string } = useParams();
    const { data, api, refresh, email }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const key: string = `lms-v2-draft:${email}:${contestId}`;
    const [answers, setAnswers]: [
        Record<string, string[]>,
        Dispatch<SetStateAction<Record<string, string[]>>>,
    ] = useState<Record<string, string[]>>((): Record<string, string[]> => {
        try {
            return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string[]>;
        } catch {
            return {};
        }
    });
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const contest: Contest | undefined = data.contests.find(
        (item): boolean => item.id === contestId,
    );
    const exam: Assessment | undefined = data.assessments.find(
        (item: Assessment): boolean => item.id === contest?.assessmentId,
    );
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === exam?.groupId,
    );
    useEffect((): void => {
        try {
            localStorage.setItem(key, JSON.stringify(answers));
        } catch {
            setError("Không thể lưu bản nháp trong trình duyệt.");
        }
    }, [key, answers]);
    useEffect((): (() => void) | undefined => {
        if (!contest || !exam || !group || !hasAccess(group) || exam.source === "PDF") return undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancelled: boolean = false;
        async function schedule(): Promise<void> {
            if (!contest) return;
            try {
                const remaining: number = Date.parse(contest.endAt) - Date.now();
                if (remaining > 0) await api.startAttempt(contest.id);
                if (cancelled) return;
                timer = setTimeout((): void => {
                    if (Date.now() < Date.parse(contest.endAt)) {
                        void schedule();
                        return;
                    }
                    void api.submit(contest.id, answers, true).then(async (): Promise<void> => {
                        localStorage.removeItem(key);
                        await refresh();
                        navigate(`/contests/${contest.id}`);
                    }).catch((reason: unknown): void => {
                        setError(reason instanceof Error ? reason.message : "Không thể tự động nộp bài.");
                    });
                }, Math.max(0, Math.min(remaining, 2147483647)));
            } catch (reason: unknown) {
                if (!cancelled) setError(reason instanceof Error ? reason.message : "Không thể bắt đầu bài làm.");
            }
        }
        void schedule();
        return (): void => { cancelled = true; if (timer) clearTimeout(timer); };
    }, [contest?.id, contest?.endAt, exam?.id, group?.id, answers, api, key, navigate]);
    if (
        !contest ||
        !exam ||
        !group ||
        !hasAccess(group) ||
        exam.source === "PDF" ||
        Date.now() < Date.parse(contest.startAt) ||
        Date.now() >= Date.parse(contest.endAt)
    )
        return <p className="empty">Kỳ thi không khả dụng.</p>;
    async function submit(): Promise<void> {
        try {
            if (!contest) return;
            await api.submit(contest.id, answers);
            localStorage.removeItem(key);
            await refresh();
            navigate(`/contests/${contest.id}`);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không nộp được bài.");
        }
    }

    function updateOption(question: Question, option: string, checked: boolean): void {
        const previous: string[] = answers[question.id] ?? [];
        let selected: string[];

        if (question.kind === "SINGLE") {
            selected = [option];
        } else if (checked) {
            selected = [...previous, option];
        } else {
            selected = previous.filter((item: string): boolean => item !== option);
        }

        setAnswers({ ...answers, [question.id]: selected });
    }

    const answered: number = exam.questions.filter((question: Question): boolean =>
        (answers[question.id] ?? []).some((value: string): boolean => !!value.trim()),
    ).length;
    return (
        <div className="attempt-page">
            <div className="assessment-breadcrumb">
                <Link to={`/contests/${contest.id}`}>Chi tiết kỳ thi</Link>
                <span>/</span>
                <span>Bài làm</span>
            </div>
            <header className="assessment-hero attempt-hero">
                <span className="assessment-hero-icon">
                    <FileText size={25} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>BÀI LÀM THỬ NGHIỆM</span>
                    </div>
                    <h1>{contest.title}</h1>
                    <p>Kết thúc {date(contest.endAt)} · Bản nháp được lưu trên trình duyệt này.</p>
                </div>
                <span className="assessment-count">
                    Đã trả lời {answered}/{exam.questions.length}
                </span>
            </header>
            <div className="form attempt-question-list">
                {exam.questions.map(
                    (question: Question, index: number): ReactNode => (
                        <section className="panel attempt-question" key={question.id}>
                            <p className="eyebrow">
                                CÂU {index + 1} · {question.points} ĐIỂM
                            </p>
                            <h2>{question.text}</h2>
                            {question.options.length ? (
                                <div className="form">
                                    {question.options.map(
                                        (option: string, i: number): ReactNode => (
                                            <label className="check option" key={i}>
                                                <input
                                                    type={
                                                        question.kind === "SINGLE"
                                                            ? "radio"
                                                            : "checkbox"
                                                    }
                                                    name={question.id}
                                                    checked={(answers[question.id] ?? []).includes(
                                                        option,
                                                    )}
                                                    onChange={(event): void =>
                                                        updateOption(
                                                            question,
                                                            option,
                                                            event.target.checked,
                                                        )
                                                    }
                                                />{" "}
                                                {option}
                                            </label>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <textarea
                                    rows={question.kind === "ESSAY" ? 5 : 2}
                                    value={answers[question.id]?.[0] ?? ""}
                                    onChange={(event): void =>
                                        setAnswers({
                                            ...answers,
                                            [question.id]: [event.target.value],
                                        })
                                    }
                                />
                            )}
                        </section>
                    ),
                )}
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <button
                    className="button primary attempt-submit"
                    type="button"
                    onClick={(): void => {
                        if (window.confirm("Nộp bài thử nghiệm?")) void submit();
                    }}
                >
                    Nộp bài thử nghiệm
                </button>
            </div>
        </div>
    );
}
