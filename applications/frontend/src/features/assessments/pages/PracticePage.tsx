import {
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { assessmentsApi, submissionsApi } from "../../../api/client";
import type {
    AssessmentContentResponse,
    AssessmentMetadata,
    PublicQuestion,
    SubmissionRecord,
    SubmittedAnswerInput
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { PageTitle } from "../../../shared/context";
import { buildPdfAnswers, PdfAnswerSheet, pdfRowIds } from "../components/PdfAnswerSheet";

export function Practice(): ReactNode {
    const { assessmentId }: { assessmentId?: string } = useParams();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();

    const [assessment, setAssessment]: [
        AssessmentMetadata | null,
        Dispatch<SetStateAction<AssessmentMetadata | null>>
    ] = useState<AssessmentMetadata | null>(null);
    const [content, setContent]: [
        AssessmentContentResponse | null,
        Dispatch<SetStateAction<AssessmentContentResponse | null>>
    ] = useState<AssessmentContentResponse | null>(null);
    const [answers, setAnswers]: [
        Record<string, string | string[]>,
        Dispatch<SetStateAction<Record<string, string | string[]>>>
    ] = useState<Record<string, string | string[]>>({});
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [submitting, setSubmitting]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        if (!assessmentId) {
            return;
        }
        setLoading(true);
        setError("");
        void Promise.all([
            assessmentsApi.getById(assessmentId),
            assessmentsApi.getContent(assessmentId)
        ])
            .then(([meta, doc]): void => {
                setAssessment(meta);
                setContent(doc);
            })
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load practice assessment."));
            })
            .finally((): void => setLoading(false));
    }, [assessmentId]);

    async function handleSubmit(): Promise<void> {
        if (!assessment || !content) {
            return;
        }
        const formattedAnswers: SubmittedAnswerInput[] =
            content.content_format === "PDF"
                ? buildPdfAnswers(pdfRowIds(assessment.question_count), answers)
                : (content.questions ?? []).map(
            (q: PublicQuestion): SubmittedAnswerInput => {
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
            }
        );
        setSubmitting(true);
        setError("");
        try {
            const created: SubmissionRecord = await submissionsApi.create(
                {
                    submission_mode: "PRACTICE",
                    trigger_type: "MANUAL",
                    assessment_id: assessment.id,
                    answers: formattedAnswers
                },
                crypto.randomUUID()
            );
            navigate(`/submissions/${created.id}`);
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to submit practice answers."));
            setSubmitting(false);
        }
    }

    if (loading) {
        return <p className="muted">Loading practice session...</p>;
    }
    if (!assessment || !assessment.is_practice_enabled || !content) {
        return (
            <div className="page-enter">
                <Link className="back" to={assessment ? `/assessments/${assessment.id}` : "/groups"}>
                    ← Back
                </Link>
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <p className="empty">This assessment is not enabled for practice.</p>
            </div>
        );
    }

    const submitButton: ReactNode = (
        <>
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            <button
                className="button primary"
                type="button"
                disabled={submitting}
                onClick={(): void => {
                    void handleSubmit();
                }}
            >
                {submitting ? "Submitting..." : "Submit practice attempt"}
            </button>
        </>
    );

    if (content.content_format === "PDF") {
        return (
            <div className="attempt-page attempt-page-wide page-enter">
                <Link className="back" to={`/assessments/${assessment.id}`}>
                    ← Assessment details
                </Link>
                <PageTitle
                    label="PRACTICE MODE"
                    title={assessment.title}
                    description="Read the exam on the left and fill in the answer sheet on the right."
                />
                <PdfAnswerSheet
                    pdfUrl={content.pdf_url}
                    title={assessment.title}
                    rowIds={pdfRowIds(assessment.question_count)}
                    answers={answers}
                    onChange={setAnswers}
                    footer={submitButton}
                />
            </div>
        );
    }

    return (
        <div className="page-enter">
            <Link className="back" to={`/assessments/${assessment.id}`}>
                ← Assessment details
            </Link>
            <PageTitle
                label="PRACTICE MODE"
                title={assessment.title}
                description="Submit your answers to receive automated grading feedback."
            />
            <div className="form">
                {(content.questions ?? []).map(
                    (question: PublicQuestion, index: number): ReactNode => (
                        <section className="panel" key={question.id}>
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
                                        const isChecked: boolean =
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
                                                    checked={isChecked}
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
                {submitButton}
            </div>
        </div>
    );
}
