import { FileText } from "lucide-react";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { assessmentsApi, contestsApi, submissionsApi } from "../../../api/client";
import type {
    AssessmentContentResponse,
    ContestSummary,
    PublicQuestion,
    SubmissionRecord,
    SubmittedAnswerInput
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { formatDate, useApp } from "../../../shared/context";
import { ExpiredAttempt, type AutoSubmitStatus } from "../components/ExpiredAttempt";
import { watchAttemptDeadline } from "../utils/attemptDeadline";
import { resolveExpiredAttempt, type ExpiredAttemptResolution } from "../utils/resolveExpiredAttempt";

type DraftAnswerMap = Record<string, string | string[]>;

export function Attempt(): ReactNode {
    const { contestId }: { contestId?: string } = useParams();
    const { user }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();

    const draftKey: string = `lms-v3-draft:${user.id}:${contestId}`;
    const hasDraftRef: { current: boolean } = useRef<boolean>(false);
    const startedHereRef: { current: boolean } = useRef<boolean>(false);
    const submittingRef: { current: boolean } = useRef<boolean>(false);
    const checkingRef: { current: boolean } = useRef<boolean>(false);
    const checkExpiredRef: { current: (() => Promise<void>) | null } =
        useRef<(() => Promise<void>) | null>(null);

    const [contest, setContest]: [
        ContestSummary | null,
        Dispatch<SetStateAction<ContestSummary | null>>
    ] = useState<ContestSummary | null>(null);
    const [content, setContent]: [
        AssessmentContentResponse | null,
        Dispatch<SetStateAction<AssessmentContentResponse | null>>
    ] = useState<AssessmentContentResponse | null>(null);
    const [answers, setAnswers]: [DraftAnswerMap, Dispatch<SetStateAction<DraftAnswerMap>>] =
        useState<DraftAnswerMap>((): DraftAnswerMap => {
            try {
                const raw: string | null = localStorage.getItem(draftKey);
                if (raw === null) {
                    return {};
                }
                const parsed: unknown = JSON.parse(raw);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                    return {};
                }
                hasDraftRef.current = true;
                return parsed as DraftAnswerMap;
            } catch {
                return {};
            }
        });
    const [submissionStatus, setSubmissionStatus]: [
        AutoSubmitStatus,
        Dispatch<SetStateAction<AutoSubmitStatus>>
    ] = useState<AutoSubmitStatus>("waiting");
    const [submissionId, setSubmissionId]: [
        string | null,
        Dispatch<SetStateAction<string | null>>
    ] = useState<string | null>(null);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        if (!contestId) {
            return;
        }
        setLoading(true);
        setError("");
        void contestsApi
            .getById(contestId)
            .then(async (loadedContest): Promise<void> => {
                setContest(loadedContest);
                const loadedContent: AssessmentContentResponse = await assessmentsApi.getContent(
                    loadedContest.assessment_id
                );
                setContent(loadedContent);
                if (
                    Date.now() >= Date.parse(loadedContest.start_time) &&
                    Date.now() < Date.parse(loadedContest.end_time)
                ) {
                    startedHereRef.current = true;
                }
            })
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load contest attempt."));
            })
            .finally((): void => setLoading(false));
    }, [contestId]);

    useEffect((): void => {
        if (
            !contest ||
            Date.now() < Date.parse(contest.start_time) ||
            Date.now() >= Date.parse(contest.end_time)
        ) {
            return;
        }
        try {
            localStorage.setItem(draftKey, JSON.stringify(answers));
            hasDraftRef.current = true;
        } catch {
            setError("Unable to save local draft in browser storage.");
        }
    }, [answers, contest, draftKey]);

    const buildPayloadAnswers: () => SubmittedAnswerInput[] =
        useCallback((): SubmittedAnswerInput[] => {
            if (!content?.questions) {
                return Object.entries(answers).map(
                    ([question_id, value]): SubmittedAnswerInput => ({
                        question_id,
                        student_response: value
                    })
                );
            }
            return content.questions.map((q: PublicQuestion): SubmittedAnswerInput => {
                const raw: string | string[] | undefined = answers[q.id];
                return {
                    question_id: q.id,
                    question_type: q.question_type,
                    student_response:
                        q.question_type === "MULTIPLE_CHOICE"
                            ? Array.isArray(raw)
                                ? raw
                                : []
                            : typeof raw === "string"
                              ? raw
                              : ""
                };
            });
        }, [answers, content?.questions]);

    const submitAttempt: (automatic: boolean) => Promise<void> = useCallback(
        async (automatic: boolean): Promise<void> => {
            if (!contest || submittingRef.current) {
                return;
            }
            submittingRef.current = true;
            setSubmissionStatus("submitting");
            setError("");
            try {
                const created: SubmissionRecord = await submissionsApi.create(
                    {
                        submission_mode: "CONTEST",
                        trigger_type: automatic ? "AUTO_TIMEOUT" : "MANUAL",
                        contest_id: contest.id,
                        answers: buildPayloadAnswers()
                    },
                    crypto.randomUUID()
                );
                try {
                    localStorage.removeItem(draftKey);
                } catch {
                    return;
                }
                navigate(`/submissions/${created.id}`, { replace: true });
            } catch (reason: unknown) {
                setError(extractErrorMessage(reason, "Unable to submit attempt."));
                setSubmissionStatus("failed");
                submittingRef.current = false;
            }
        },
        [buildPayloadAnswers, contest, draftKey, navigate]
    );

    const checkExpiredAttempt: () => Promise<void> = useCallback(async (): Promise<void> => {
        if (!contest || checkingRef.current || submittingRef.current) {
            return;
        }
        checkingRef.current = true;
        setSubmissionStatus("waiting");
        setError("");
        try {
            const resolution: ExpiredAttemptResolution = await resolveExpiredAttempt(
                async (): Promise<SubmissionRecord[]> => {
                    const res = await submissionsApi.listMine({
                        contest_id: contest.id,
                        page: 1,
                        limit: 5
                    });
                    return res.items;
                },
                hasDraftRef.current,
                startedHereRef.current
            );
            if (resolution.state === "IN_PROGRESS") {
                await submitAttempt(true);
            } else if (resolution.state === "SUBMITTED") {
                setSubmissionId(resolution.submissionId);
                setSubmissionStatus("submitted");
            } else if (resolution.state === "DRAFT_MISSING") {
                setSubmissionStatus("draft_missing");
            } else {
                setSubmissionStatus("not_started");
            }
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to verify attempt state."));
            setSubmissionStatus("failed");
        } finally {
            checkingRef.current = false;
        }
    }, [contest, submitAttempt]);

    useLayoutEffect((): void => {
        checkExpiredRef.current = checkExpiredAttempt;
    });

    useEffect((): (() => void) | undefined => {
        if (!contest || Date.now() < Date.parse(contest.start_time)) {
            return undefined;
        }
        let cancelled: boolean = false;
        const stop: () => void = watchAttemptDeadline(contest.end_time, (): void => {
            if (!cancelled) {
                void checkExpiredRef.current?.();
            }
        });
        return (): void => {
            cancelled = true;
            stop();
        };
    }, [contest]);

    if (loading) {
        return <p className="muted">Loading contest workspace...</p>;
    }
    if (!contest || !content || Date.now() < Date.parse(contest.start_time)) {
        return (
            <div className="page-enter">
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <p className="empty">Contest is not currently open for attempts.</p>
            </div>
        );
    }
    if (Date.now() >= Date.parse(contest.end_time)) {
        return (
            <ExpiredAttempt
                contestId={contest.id}
                status={submissionStatus}
                error={error}
                submissionId={submissionId}
                onRetry={(): void => {
                    void checkExpiredAttempt();
                }}
            />
        );
    }

    const questions: PublicQuestion[] = content.questions ?? [];
    const answeredCount: number = questions.filter((q: PublicQuestion): boolean => {
        const val: string | string[] | undefined = answers[q.id];
        if (Array.isArray(val)) {
            return val.length > 0;
        }
        return typeof val === "string" && val.trim().length > 0;
    }).length;

    return (
        <div className="attempt-page page-enter">
            <div className="assessment-breadcrumb">
                <Link to={`/contests/${contest.id}`}>Contest details</Link>
                <span>/</span>
                <span>Active attempt</span>
            </div>
            <header className="assessment-hero attempt-hero">
                <span className="assessment-hero-icon">
                    <FileText size={25} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>CONTEST ATTEMPT</span>
                    </div>
                    <h1>{contest.title}</h1>
                    <p>
                        Closes {formatDate(contest.end_time)} · Answers are saved locally in this
                        browser while you work.
                    </p>
                </div>
                {questions.length > 0 && (
                    <span className="assessment-count">
                        Answered {answeredCount}/{questions.length}
                    </span>
                )}
            </header>

            <div className="form attempt-question-list">
                {content.content_format === "PDF" && content.pdf_url && (
                    <section className="panel">
                        <h2>PDF Assessment</h2>
                        <p className="muted">
                            Open the exam PDF document in a new tab while submitting your answers
                            below.
                        </p>
                        <a
                            className="button primary"
                            href={content.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Open PDF Exam
                        </a>
                    </section>
                )}

                {questions.map(
                    (question: PublicQuestion, index: number): ReactNode => (
                        <section className="panel attempt-question" key={question.id}>
                            <p className="eyebrow">
                                QUESTION {index + 1} · {question.points} PTS ·{" "}
                                {question.question_type}
                            </p>
                            <h2>{question.prompt}</h2>
                            {question.options && question.options.length > 0 ? (
                                <div className="form">
                                    {question.options.map((option): ReactNode => {
                                        const currentVal: string | string[] | undefined =
                                            answers[question.id];
                                        const checked: boolean =
                                            question.question_type === "MULTIPLE_CHOICE"
                                                ? Array.isArray(currentVal) &&
                                                  currentVal.includes(option.key)
                                                : currentVal === option.key;
                                        return (
                                            <label className="check option" key={option.key}>
                                                <input
                                                    type={
                                                        question.question_type === "MULTIPLE_CHOICE"
                                                            ? "checkbox"
                                                            : "radio"
                                                    }
                                                    name={question.id}
                                                    checked={checked}
                                                    onChange={(event): void => {
                                                        if (
                                                            question.question_type ===
                                                            "MULTIPLE_CHOICE"
                                                        ) {
                                                            const prev: string[] = Array.isArray(
                                                                currentVal
                                                            )
                                                                ? currentVal
                                                                : [];
                                                            setAnswers({
                                                                ...answers,
                                                                [question.id]: event.target.checked
                                                                    ? [...prev, option.key]
                                                                    : prev.filter(
                                                                          (k): boolean =>
                                                                              k !== option.key
                                                                      )
                                                            });
                                                            return;
                                                        }
                                                        setAnswers({
                                                            ...answers,
                                                            [question.id]: option.key
                                                        });
                                                    }}
                                                />{" "}
                                                <span>
                                                    <strong>{option.key}.</strong> {option.text}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : (
                                <textarea
                                    rows={question.question_type === "ESSAY" ? 5 : 2}
                                    value={
                                        typeof answers[question.id] === "string"
                                            ? (answers[question.id] as string)
                                            : ""
                                    }
                                    onChange={(event): void =>
                                        setAnswers({
                                            ...answers,
                                            [question.id]: event.target.value
                                        })
                                    }
                                />
                            )}
                        </section>
                    )
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
                        if (window.confirm("Submit your answers now?")) {
                            void submitAttempt(false);
                        }
                    }}
                >
                    {submissionStatus === "submitting" ? "Submitting..." : "Submit attempt"}
                </button>
            </div>
        </div>
    );
}
