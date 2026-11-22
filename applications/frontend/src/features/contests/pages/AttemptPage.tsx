import {
    FileText
} from "lucide-react";
import type { Dispatch,SetStateAction } from "react";
import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from "react";
import { Link,useNavigate,useParams } from "react-router-dom";
import { date,hasAccess,useApp } from "../../../shared/context";
import type { Assessment,Contest,Group,Question } from "../../../types";
import { ExpiredAttempt, type AutoSubmitStatus } from "../components/ExpiredAttempt";
import { resolveExpiredAttempt, type ExpiredAttemptResolution } from "../utils/resolveExpiredAttempt";
import { watchAttemptDeadline } from "../utils/attemptDeadline";

export function Attempt(): ReactNode {
    const { contestId }: { contestId?: string } = useParams();
    const { data, api, refresh, email }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const key: string = `lms-v2-draft:${email}:${contestId}`;
    const hasDraft: ReturnType<typeof useRef<boolean>> = useRef<boolean>(false);
    const startedHere: ReturnType<typeof useRef<boolean>> = useRef<boolean>(false);
    const [answers, setAnswers]: [
        Record<string, string[]>,
        Dispatch<SetStateAction<Record<string, string[]>>>,
    ] = useState<Record<string, string[]>>((): Record<string, string[]> => {
        try {
            const saved: string | null = localStorage.getItem(key);
            if (saved === null) return {};
            const parsed: unknown = JSON.parse(saved);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
            hasDraft.current = true;
            return parsed as Record<string, string[]>;
        } catch {
            return {};
        }
    });
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [submissionStatus, setSubmissionStatus]: [
        AutoSubmitStatus,
        Dispatch<SetStateAction<AutoSubmitStatus>>,
    ] = useState<AutoSubmitStatus>("waiting");
    const [submissionId, setSubmissionId]: [string | null, Dispatch<SetStateAction<string | null>>] =
        useState<string | null>(null);
    const submitting: ReturnType<typeof useRef<boolean>> = useRef<boolean>(false);
    const checking: ReturnType<typeof useRef<boolean>> = useRef<boolean>(false);
    const startRequest: ReturnType<typeof useRef<{ contestId: string; promise: Promise<void> } | null>> =
        useRef<{ contestId: string; promise: Promise<void> } | null>(null);
    const checkExpiredRef: ReturnType<typeof useRef<(() => Promise<void>) | null>> =
        useRef<(() => Promise<void>) | null>(null);
    const contest: Contest | undefined = data.contests.find(
        (item): boolean => item.id === contestId,
    );
    const exam: Assessment | undefined = data.assessments.find(
        (item: Assessment): boolean => item.id === contest?.assessmentId,
    );
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === exam?.groupId,
    );

    async function submitAttempt(automatic: boolean): Promise<void> {
        if (!contest || submitting.current) return;
        submitting.current = true;
        setSubmissionStatus("submitting");
        setError("");
        try {
            await api.submit(contest.id, answers, automatic);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể nộp bài.");
            setSubmissionStatus("failed");
            submitting.current = false;
            return;
        }

        try {
            localStorage.removeItem(key);
        } catch {
            // Không ảnh hưởng đến bài đã nộp.
        }
        try {
            await refresh();
        } catch {
            // Bài đã nộp; dữ liệu sẽ được tải lại sau.
        }
        navigate(`/contests/${contest.id}`);
    }

    async function checkExpiredAttempt(): Promise<void> {
        if (!contest || checking.current || submitting.current) return;
        checking.current = true;
        setSubmissionStatus("waiting");
        setError("");
        try {
            const result: ExpiredAttemptResolution = await resolveExpiredAttempt(
                api,
                contest.id,
                Boolean(hasDraft.current || startedHere.current),
            );
            if (result.state === "IN_PROGRESS") {
                await submitAttempt(true);
            } else if (result.state === "SUBMITTED") {
                setSubmissionId(result.submissionId);
                setSubmissionStatus("submitted");
            } else if (result.state === "DRAFT_MISSING") {
                setSubmissionStatus("draft_missing");
            } else {
                setSubmissionStatus("not_started");
            }
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể kiểm tra lượt làm bài.");
            setSubmissionStatus("failed");
        } finally {
            checking.current = false;
        }
    }

    useLayoutEffect((): void => {
        checkExpiredRef.current = checkExpiredAttempt;
    });

    useEffect((): void => {
        if (!contest || !exam || !group || !hasAccess(group) || exam.source === "PDF" ||
            Date.now() < Date.parse(contest.startAt) || Date.now() >= Date.parse(contest.endAt)) return;
        try {
            localStorage.setItem(key, JSON.stringify(answers));
            hasDraft.current = true;
        } catch {
            setError("Không thể lưu bản nháp trong trình duyệt.");
        }
    }, [key, answers, contest?.id, contest?.startAt, contest?.endAt, exam?.id, exam?.source, group?.id, group?.role, group?.visibility]);
    const canAttempt: boolean = Boolean(
        contest && exam && group && hasAccess(group) && exam.source !== "PDF",
    );

    // TODO: Đối chiếu bắt đầu, bản nháp và tự nộp với contract Contest/Submission.
    useEffect((): (() => void) | undefined => {
        if (!canAttempt || !contest || Date.now() < Date.parse(contest.startAt) ||
            Date.now() >= Date.parse(contest.endAt)) return undefined;
        let cancelled: boolean = false;
        if (startRequest.current?.contestId !== contest.id) {
            startRequest.current = { contestId: contest.id, promise: api.startAttempt(contest.id) };
        }
        void startRequest.current.promise.then((): void => {
            if (!cancelled) startedHere.current = true;
        }).catch((reason: unknown): void => {
            if (!cancelled) {
                setError(reason instanceof Error ? reason.message : "Không thể bắt đầu bài làm.");
                setSubmissionStatus("failed");
            }
        });
        return (): void => { cancelled = true; };
    }, [api, canAttempt, contest?.id, contest?.startAt, contest?.endAt]);

    useEffect((): (() => void) | undefined => {
        if (!canAttempt || !contest || Date.now() < Date.parse(contest.startAt)) return undefined;
        let cancelled: boolean = false;
        const stop: () => void = watchAttemptDeadline(contest.endAt, (): void => {
            async function finish(): Promise<void> {
                try {
                    const request: { contestId: string; promise: Promise<void> } | null | undefined = startRequest.current;
                    if (request && request.contestId === contest?.id) {
                        await request.promise;
                    }
                    if (!cancelled) await checkExpiredRef.current?.();
                } catch (reason: unknown) {
                    if (!cancelled) {
                        setError(reason instanceof Error ? reason.message : "Không thể bắt đầu bài làm.");
                        setSubmissionStatus("failed");
                    }
                }
            }
            void finish();
        });
        return (): void => { cancelled = true; stop(); };
    }, [canAttempt, contest?.id, contest?.startAt, contest?.endAt]);
    if (
        !contest ||
        !exam ||
        !group ||
        !hasAccess(group) ||
        exam.source === "PDF" ||
        Date.now() < Date.parse(contest.startAt)
    )
        return <p className="empty">Kỳ thi không khả dụng.</p>;
    if (Date.now() >= Date.parse(contest.endAt)) {
        return (
            <ExpiredAttempt
                contestId={contest.id}
                status={submissionStatus}
                error={error}
                submissionId={submissionId}
                onRetry={(): void => { void checkExpiredAttempt(); }}
            />
        );
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
                    disabled={submissionStatus === "submitting"}
                    onClick={(): void => {
                        if (window.confirm("Nộp bài thử nghiệm?")) void submitAttempt(false);
                    }}
                >
                    {submissionStatus === "submitting" ? "Đang nộp bài…" : "Nộp bài thử nghiệm"}
                </button>
            </div>
        </div>
    );
}
