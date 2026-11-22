import {
    BookOpen,
    FileText,
    Globe2,
    GraduationCap,
    Heart,
    LockKeyhole,
    Pencil,
    Play,
    Trash2,
    Users
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { assessmentsApi, groupsApi } from "../../../api/client";
import type {
    AnswerKeyDocument,
    AssessmentContentResponse,
    AssessmentMetadata,
    FavoriteAssessmentItem,
    GroupSummary,
    PublicQuestion
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { canManage, useApp } from "../../../shared/context";

export function AssessmentDetail(): ReactNode {
    const { assessmentId }: { assessmentId?: string } = useParams();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const { user }: ReturnType<typeof useApp> = useApp();

    const [assessment, setAssessment]: [
        AssessmentMetadata | null,
        Dispatch<SetStateAction<AssessmentMetadata | null>>
    ] = useState<AssessmentMetadata | null>(null);
    const [group, setGroup]: [GroupSummary | null, Dispatch<SetStateAction<GroupSummary | null>>] =
        useState<GroupSummary | null>(null);
    const [content, setContent]: [
        AssessmentContentResponse | null,
        Dispatch<SetStateAction<AssessmentContentResponse | null>>
    ] = useState<AssessmentContentResponse | null>(null);
    const [answerKey, setAnswerKey]: [
        AnswerKeyDocument | null,
        Dispatch<SetStateAction<AnswerKeyDocument | null>>
    ] = useState<AnswerKeyDocument | null>(null);
    const [isFavorited, setIsFavorited]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const loadAssessment: () => Promise<void> = useCallback(async (): Promise<void> => {
        if (!assessmentId) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            const loaded: AssessmentMetadata = await assessmentsApi.getById(assessmentId);
            setAssessment(loaded);

            const owningGroup: GroupSummary | null =
                loaded.group ?? (await groupsApi.getById(loaded.group_id).catch((): null => null));
            setGroup(owningGroup);

            const isManager: boolean = owningGroup
                ? canManage(owningGroup, user.system_role)
                : user.system_role === "ADMIN" || loaded.created_by === user.id;

            const favRes = await assessmentsApi.listFavorites({ page: 1, limit: 100 });
            setIsFavorited(
                favRes.items.some(
                    (item: FavoriteAssessmentItem): boolean => item.assessment.id === loaded.id
                )
            );

            if (isManager || loaded.is_practice_enabled) {
                const loadedContent: AssessmentContentResponse = await assessmentsApi.getContent(
                    loaded.id
                );
                setContent(loadedContent);
                if (isManager) {
                    const keyDoc: AnswerKeyDocument | null = await assessmentsApi
                        .getAnswerKey(loaded.id)
                        .catch((): null => null);
                    setAnswerKey(keyDoc);
                } else {
                    setAnswerKey(null);
                }
            } else {
                setContent(null);
                setAnswerKey(null);
            }
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load assessment."));
        } finally {
            setLoading(false);
        }
    }, [assessmentId, user.id, user.system_role]);

    useEffect((): void => {
        void loadAssessment();
    }, [loadAssessment]);

    async function toggleFavorite(): Promise<void> {
        if (!assessment) {
            return;
        }
        setError("");
        try {
            if (isFavorited) {
                await assessmentsApi.unfavorite(assessment.id);
                setIsFavorited(false);
            } else {
                await assessmentsApi.favorite(assessment.id);
                setIsFavorited(true);
            }
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to update favorite status."));
        }
    }

    async function handleDelete(): Promise<void> {
        if (
            !assessment ||
            !window.confirm(
                "Delete this assessment? Linked contests and submissions may be affected. This cannot be undone."
            )
        ) {
            return;
        }
        try {
            await assessmentsApi.delete(assessment.id);
            navigate(`/groups/${assessment.group_id}`, { replace: true });
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to delete assessment."));
        }
    }

    if (loading && !assessment) {
        return <p className="muted">Loading assessment...</p>;
    }
    if (!assessment) {
        return (
            <div className="page-enter">
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <p className="empty">Assessment not found.</p>
            </div>
        );
    }

    const managerView: boolean = group
        ? canManage(group, user.system_role)
        : user.system_role === "ADMIN" || assessment.created_by === user.id;
    const contestOnlyLocked: boolean = !managerView && !assessment.is_practice_enabled;
    const canPractice: boolean =
        assessment.is_practice_enabled && assessment.content_format === "JSON";

    return (
        <div className="assessment-detail-page page-enter">
            <div className="assessment-breadcrumb">
                <Link to={`/groups/${assessment.group_id}`}>
                    {group?.name ?? "Learning Group"}
                </Link>
                <span>/</span>
                <span>Assessment details</span>
            </div>

            <header className="assessment-hero">
                <span className="assessment-hero-icon">
                    <BookOpen size={26} strokeWidth={1.7} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>ASSESSMENT</span>
                        <span className="assessment-visibility">
                            {assessment.visibility === "PUBLIC" ? (
                                <Globe2 size={13} />
                            ) : (
                                <LockKeyhole size={13} />
                            )}
                            {assessment.visibility}
                        </span>
                        <span className="badge">{assessment.assessment_type}</span>
                    </div>
                    <h1>{assessment.title}</h1>
                    <p>{assessment.description || "Assessment inside group contest & practice library."}</p>
                    <Link className="assessment-group-link" to={`/groups/${assessment.group_id}`}>
                        <Users size={15} /> {group?.name ?? "View owning group"}
                    </Link>
                </div>
                <div className="assessment-hero-actions" aria-label="Assessment actions">
                    <button
                        className="icon-button"
                        type="button"
                        aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
                        aria-pressed={isFavorited}
                        title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                        onClick={(): void => {
                            void toggleFavorite();
                        }}
                    >
                        <Heart size={18} fill={isFavorited ? "currentColor" : "none"} />
                    </button>
                    {managerView && (
                        <>
                            <Link
                                className="icon-button"
                                aria-label="Edit assessment"
                                title="Edit assessment"
                                to={`/assessments/${assessment.id}/edit`}
                            >
                                <Pencil size={17} />
                            </Link>
                            <button
                                className="icon-button"
                                type="button"
                                aria-label="Delete assessment"
                                title="Delete assessment"
                                onClick={(): void => {
                                    void handleDelete();
                                }}
                            >
                                <Trash2 size={17} />
                            </button>
                        </>
                    )}
                </div>
            </header>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {contestOnlyLocked ? (
                <section className="assessment-locked">
                    <span className="assessment-locked-icon">
                        <LockKeyhole size={22} />
                    </span>
                    <div>
                        <p className="assessment-section-kicker">CONTEST-SCOPED ASSESSMENT</p>
                        <h2>Practice is not enabled for this assessment</h2>
                        <p>
                            Assessments are reserved for scheduled contests inside their owning
                            group unless practice mode is explicitly enabled by a group manager.
                        </p>
                        <Link className="button primary" to={`/groups/${assessment.group_id}`}>
                            View group contests
                        </Link>
                    </div>
                </section>
            ) : (
                <div className="assessment-workspace">
                    <section className="assessment-section assessment-questions">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">ASSESSMENT CONTENT</p>
                                <h2>
                                    {assessment.content_format === "PDF"
                                        ? "PDF Document"
                                        : "Questions"}
                                </h2>
                                <p>
                                    Version {assessment.version} · {assessment.question_count}{" "}
                                    questions
                                </p>
                            </div>
                            <span className="assessment-count">
                                {assessment.total_points} total pts
                            </span>
                        </div>

                        {content?.content_format === "PDF" ? (
                            <div className="assessment-placeholder">
                                <FileText size={21} />
                                <div>
                                    <strong>PDF exam file</strong>
                                    <p>
                                        Download or preview the attached PDF exam using the secure
                                        temporary link.
                                    </p>
                                    {content.pdf_url && (
                                        <a
                                            className="button primary"
                                            href={content.pdf_url}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Open PDF exam
                                        </a>
                                    )}
                                </div>
                            </div>
                        ) : content?.questions && content.questions.length > 0 ? (
                            <div className="assessment-question-list">
                                {content.questions.map(
                                    (question: PublicQuestion, index: number): ReactNode => (
                                        <article className="assessment-question" key={question.id}>
                                            <span className="assessment-question-number">
                                                {String(index + 1).padStart(2, "0")}
                                            </span>
                                            <div className="assessment-question-content">
                                                <div className="assessment-question-meta">
                                                    <span>QUESTION {question.order}</span>
                                                    <span>{question.question_type}</span>
                                                    <span>{question.points} PTS</span>
                                                </div>
                                                <h3>{question.prompt}</h3>
                                                {question.options && question.options.length > 0 && (
                                                    <ul className="assessment-option-preview">
                                                        {question.options.map(
                                                            (opt): ReactNode => (
                                                                <li key={opt.key}>
                                                                    <strong>{opt.key}.</strong>{" "}
                                                                    {opt.text}
                                                                </li>
                                                            )
                                                        )}
                                                    </ul>
                                                )}
                                            </div>
                                        </article>
                                    )
                                )}
                            </div>
                        ) : (
                            <div className="assessment-placeholder">
                                <BookOpen size={21} />
                                <div>
                                    <strong>No questions found</strong>
                                    <p>Questions will appear once authored for this version.</p>
                                </div>
                            </div>
                        )}
                    </section>

                    <aside className="assessment-side">
                        <section className="assessment-section assessment-info">
                            <div className="assessment-section-heading">
                                <div>
                                    <p className="assessment-section-kicker">OVERVIEW</p>
                                    <h2>Metadata</h2>
                                </div>
                            </div>
                            <dl className="assessment-info-list">
                                <div>
                                    <dt>Group</dt>
                                    <dd>{group?.name ?? assessment.group_id}</dd>
                                </div>
                                <div>
                                    <dt>Format</dt>
                                    <dd>{assessment.content_format}</dd>
                                </div>
                                <div>
                                    <dt>Questions</dt>
                                    <dd>{assessment.question_count}</dd>
                                </div>
                                <div>
                                    <dt>Total points</dt>
                                    <dd>{assessment.total_points}</dd>
                                </div>
                                <div>
                                    <dt>Practice mode</dt>
                                    <dd>
                                        {assessment.is_practice_enabled ? "Enabled" : "Contest only"}
                                    </dd>
                                </div>
                                {answerKey && (
                                    <div>
                                        <dt>Answer key</dt>
                                        <dd>{answerKey.answers.length} mapped</dd>
                                    </div>
                                )}
                            </dl>
                        </section>

                        <section className="assessment-section assessment-start">
                            <span className="assessment-start-icon">
                                <GraduationCap size={21} />
                            </span>
                            <h2>Practice mode</h2>
                            <p>
                                {canPractice
                                    ? "Start a self-paced practice submission against this assessment."
                                    : assessment.content_format === "PDF"
                                      ? "Interactive practice is available for structured digital assessments."
                                      : "This assessment is scoped to scheduled group contests only."}
                            </p>
                            {canPractice && (
                                <Link
                                    className="button primary assessment-practice-button"
                                    to={`/assessments/${assessment.id}/practice`}
                                >
                                    <Play size={16} fill="currentColor" /> Start practice
                                </Link>
                            )}
                            <Link
                                className="assessment-back-group"
                                to={`/groups/${assessment.group_id}`}
                            >
                                Back to group
                            </Link>
                        </section>
                    </aside>
                </div>
            )}
        </div>
    );
}
