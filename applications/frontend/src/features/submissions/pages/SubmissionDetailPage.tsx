import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    FileText,
    MessageSquare,
    XCircle
} from "lucide-react";
import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useParams } from "react-router-dom";
import { assessmentsApi, submissionsApi } from "../../../api/client";
import type {
    AssessmentContentResponse,
    PublicQuestion,
    QuestionOption,
    SubmissionAnswer,
    SubmissionGradingStatus,
    SubmissionRecord
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { PageTitle, formatDate } from "../../../shared/context";

function statusText(status: SubmissionGradingStatus): string {
    if (status === "PENDING_MANUAL") {
        return "Pending manual grading";
    }
    if (status === "AUTO_GRADED") {
        return "Auto-graded";
    }
    if (status === "GRADED") {
        return "Graded";
    }
    if (status === "FAILED") {
        return "Grading failed";
    }
    return "Queued";
}

function formatResponseValue(
    value: unknown,
    options: QuestionOption[] | null | undefined
): string {
    if (value === null || value === undefined || value === "") {
        return "No answer provided";
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return "No answer provided";
        }
        return value
            .map((entry: unknown): string => {
                const key: string = String(entry);
                const match: QuestionOption | undefined = options?.find(
                    (opt: QuestionOption): boolean => opt.key === key
                );
                return match ? `${match.key}. ${match.text}` : key;
            })
            .join(", ");
    }
    const text: string = String(value);
    const match: QuestionOption | undefined = options?.find(
        (opt: QuestionOption): boolean => opt.key === text
    );
    return match ? `${match.key}. ${match.text}` : text;
}

export function SubmissionDetail(): ReactNode {
    const { submissionId }: { submissionId?: string } = useParams();
    const [submission, setSubmission]: [
        SubmissionRecord | null,
        Dispatch<SetStateAction<SubmissionRecord | null>>
    ] = useState<SubmissionRecord | null>(null);
    const [questions, setQuestions]: [
        PublicQuestion[],
        Dispatch<SetStateAction<PublicQuestion[]>>
    ] = useState<PublicQuestion[]>([]);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): (() => void) | undefined => {
        if (!submissionId) {
            setError("Submission identifier is missing.");
            setLoading(false);
            return undefined;
        }

        let cancelled: boolean = false;
        setLoading(true);
        setError("");

        submissionsApi
            .getById(submissionId)
            .then(async (record: SubmissionRecord): Promise<void> => {
                if (cancelled) {
                    return;
                }
                setSubmission(record);

                try {
                    const content: AssessmentContentResponse = await assessmentsApi.getContent(
                        record.assessment_id
                    );
                    if (!cancelled && content.questions) {
                        setQuestions(content.questions);
                    }
                } catch {
                    if (!cancelled) {
                        setQuestions([]);
                    }
                }
            })
            .catch((err: unknown): void => {
                if (!cancelled) {
                    setError(extractErrorMessage(err, "Unable to load submission details."));
                }
            })
            .finally((): void => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return (): void => {
            cancelled = true;
        };
    }, [submissionId]);

    const questionMap: Map<string, PublicQuestion> = useMemo((): Map<string, PublicQuestion> => {
        const map: Map<string, PublicQuestion> = new Map<string, PublicQuestion>();
        questions.forEach((question: PublicQuestion): void => {
            map.set(question.id, question);
        });
        return map;
    }, [questions]);

    if (loading) {
        return (
            <section className="panel page-enter" aria-busy="true">
                <div className="skeleton-block" />
                <div className="skeleton-block" />
            </section>
        );
    }

    if (error || !submission) {
        return (
            <div className="page-enter">
                <p className="back-link-row">
                    <Link className="link" to="/submissions">
                        <ArrowLeft size={15} /> Back to submissions
                    </Link>
                </p>
                <p className="error" role="alert">
                    {error || "Submission not found."}
                </p>
            </div>
        );
    }

    const answers: SubmissionAnswer[] = submission.answers ?? [];

    return (
        <div className="page-enter">
            <p className="back-link-row">
                <Link className="link" to="/submissions">
                    <ArrowLeft size={15} /> Back to submissions
                </Link>
            </p>

            <PageTitle
                label={
                    submission.submission_mode === "CONTEST"
                        ? "Contest submission"
                        : "Practice submission"
                }
                title={submission.contest?.title ?? "Submission details"}
                description={`Submitted on ${formatDate(submission.submitted_at)} · Attempt #${submission.attempt_number}`}
                action={
                    <div className="action-row">
                        {submission.group_id && (
                            <Link className="button" to={`/groups/${submission.group_id}`}>
                                View group
                            </Link>
                        )}
                        {submission.contest_id && (
                            <Link className="button" to={`/contests/${submission.contest_id}`}>
                                View contest
                            </Link>
                        )}
                    </div>
                }
            />

            <section className="profile-kpi-grid" aria-label="Submission scores and metadata">
                <div className="panel kpi-card">
                    <span className="kpi-label">Total score</span>
                    <strong className="kpi-value">
                        {submission.total_score !== null
                            ? `${submission.total_score} / ${submission.max_score}`
                            : `— / ${submission.max_score}`}
                    </strong>
                    <span className="kpi-sub">{statusText(submission.grading_status)}</span>
                </div>
                <div className="panel kpi-card">
                    <span className="kpi-label">Objective score</span>
                    <strong className="kpi-value">
                        {submission.objective_score !== null ? submission.objective_score : "—"}
                    </strong>
                    <span className="kpi-sub">Automatically scored items</span>
                </div>
                <div className="panel kpi-card">
                    <span className="kpi-label">Essay score</span>
                    <strong className="kpi-value">
                        {submission.essay_score !== null ? submission.essay_score : "—"}
                    </strong>
                    <span className="kpi-sub">
                        {submission.grader
                            ? `Graded by ${submission.grader.display_name}`
                            : "Manual review"}
                    </span>
                </div>
                <div className="panel kpi-card">
                    <span className="kpi-label">Attempt details</span>
                    <strong className="kpi-value">#{submission.attempt_number}</strong>
                    <span className="kpi-sub">
                        {submission.trigger_type === "AUTO_TIMEOUT"
                            ? "Auto-submitted on timeout"
                            : "Manual submission"}
                    </span>
                </div>
            </section>

            <section className="panel">
                <div className="panel-head">
                    <div>
                        <p className="eyebrow">Details</p>
                        <h2>Recorded information</h2>
                    </div>
                    <div className="action-row">
                        {submission.is_final_attempt && <span className="badge">Final attempt</span>}
                        <span className="badge">{statusText(submission.grading_status)}</span>
                    </div>
                </div>
                <div className="metadata-grid">
                    {submission.student && (
                        <div>
                            <span className="eyebrow">Student</span>
                            <p>
                                <Link
                                    className="link"
                                    to={`/users/${encodeURIComponent(submission.student.username)}`}
                                >
                                    {submission.student.display_name} (@{submission.student.username})
                                </Link>
                            </p>
                        </div>
                    )}
                    {submission.group && (
                        <div>
                            <span className="eyebrow">Group</span>
                            <p>
                                <Link className="link" to={`/groups/${submission.group.id}`}>
                                    {submission.group.name}
                                </Link>
                            </p>
                        </div>
                    )}
                    <div>
                        <span className="eyebrow">Assessment version</span>
                        <p>Version {submission.assessment_version}</p>
                    </div>
                    <div>
                        <span className="eyebrow">Finalized at</span>
                        <p>
                            {submission.final_graded_at
                                ? formatDate(submission.final_graded_at)
                                : "Awaiting completion"}
                        </p>
                    </div>
                </div>
            </section>

            <section className="panel">
                <div className="panel-head">
                    <div>
                        <p className="eyebrow">Answer breakdown</p>
                        <h2>Responses ({answers.length})</h2>
                    </div>
                </div>

                {answers.length === 0 ? (
                    <p className="empty">No individual answers recorded for this submission.</p>
                ) : (
                    <div className="stack">
                        {answers.map((answer: SubmissionAnswer, index: number): ReactNode => {
                            const question: PublicQuestion | undefined = questionMap.get(
                                answer.question_id
                            );
                            const options: QuestionOption[] | null | undefined = question?.options;

                            return (
                                <article key={answer.id} className="panel answer-review-card">
                                    <div className="panel-head">
                                        <div>
                                            <span className="badge">
                                                Question {question?.order ?? index + 1} ·{" "}
                                                {answer.question_type}
                                            </span>
                                            {question?.prompt ? (
                                                <h3>{question.prompt}</h3>
                                            ) : (
                                                <h3>
                                                    <FileText size={15} /> Question ID:{" "}
                                                    <code>{answer.question_id}</code>
                                                </h3>
                                            )}
                                        </div>
                                        <div className="action-row">
                                            {answer.is_correct === true && (
                                                <span className="badge">
                                                    <CheckCircle2 size={14} /> Correct
                                                </span>
                                            )}
                                            {answer.is_correct === false && (
                                                <span className="badge">
                                                    <XCircle size={14} /> Incorrect
                                                </span>
                                            )}
                                            {answer.is_correct === null && (
                                                <span className="badge">
                                                    <Clock size={14} />{" "}
                                                    {answer.grading_status === "MANUALLY_GRADED"
                                                        ? "Manually graded"
                                                        : "Pending review"}
                                                </span>
                                            )}
                                            <strong className="badge">
                                                {answer.earned_points !== null
                                                    ? `${answer.earned_points} / ${answer.max_points} pts`
                                                    : `— / ${answer.max_points} pts`}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className="stack-compact">
                                        <div>
                                            <span className="eyebrow">Your response</span>
                                            <p>{formatResponseValue(answer.student_response, options)}</p>
                                        </div>

                                        {answer.expected_answer_snapshot !== undefined &&
                                            answer.expected_answer_snapshot !== null && (
                                                <div>
                                                    <span className="eyebrow">Expected answer</span>
                                                    <p>
                                                        {formatResponseValue(
                                                            answer.expected_answer_snapshot,
                                                            options
                                                        )}
                                                    </p>
                                                </div>
                                            )}

                                        {answer.grader_feedback && (
                                            <div className="notice">
                                                <strong>
                                                    <MessageSquare size={14} /> Grader feedback:
                                                </strong>{" "}
                                                {answer.grader_feedback}
                                            </div>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
