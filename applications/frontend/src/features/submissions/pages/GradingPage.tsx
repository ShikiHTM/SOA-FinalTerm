import {
    ArrowLeft,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    ShieldAlert
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useParams } from "react-router-dom";
import { assessmentsApi, groupsApi, submissionsApi } from "../../../api/client";
import type {
    AssessmentContentResponse,
    GroupSummary,
    ManualGradeItem,
    PaginatedResult,
    PaginationMeta,
    PublicQuestion,
    QuestionOption,
    SubmissionAnswer,
    SubmissionGradingStatus,
    SubmissionRecord
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { PageTitle, canManage, formatDate, useApp } from "../../../shared/context";

const PAGE_LIMIT: number = 10;

type GradingFilter = "ALL" | "PENDING_MANUAL" | "GRADED";

type DraftGrade = {
    earned_points: string;
    grader_feedback: string;
};

function formatAnswerText(
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
                const opt: QuestionOption | undefined = options?.find(
                    (candidate: QuestionOption): boolean => candidate.key === key
                );
                return opt ? `${opt.key}. ${opt.text}` : key;
            })
            .join(", ");
    }
    const key: string = String(value);
    const opt: QuestionOption | undefined = options?.find(
        (candidate: QuestionOption): boolean => candidate.key === key
    );
    return opt ? `${opt.key}. ${opt.text}` : key;
}

function gradingBadgeLabel(status: SubmissionGradingStatus): string {
    if (status === "PENDING_MANUAL") {
        return "Pending manual";
    }
    if (status === "GRADED") {
        return "Graded";
    }
    if (status === "AUTO_GRADED") {
        return "Auto-graded";
    }
    if (status === "FAILED") {
        return "Failed";
    }
    return "Queued";
}

export function Grading(): ReactNode {
    const { groupId }: { groupId?: string } = useParams();
    const { user } = useApp();

    const [group, setGroup]: [GroupSummary | null, Dispatch<SetStateAction<GroupSummary | null>>] =
        useState<GroupSummary | null>(null);
    const [items, setItems]: [SubmissionRecord[], Dispatch<SetStateAction<SubmissionRecord[]>>] =
        useState<SubmissionRecord[]>([]);
    const [pagination, setPagination]: [PaginationMeta, Dispatch<SetStateAction<PaginationMeta>>] =
        useState<PaginationMeta>({
            page: 1,
            limit: PAGE_LIMIT,
            total: 0,
            total_pages: 1
        });
    const [page, setPage]: [number, Dispatch<SetStateAction<number>>] = useState<number>(1);
    const [filter, setFilter]: [GradingFilter, Dispatch<SetStateAction<GradingFilter>>] =
        useState<GradingFilter>("PENDING_MANUAL");
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const [selected, setSelected]: [
        SubmissionRecord | null,
        Dispatch<SetStateAction<SubmissionRecord | null>>
    ] = useState<SubmissionRecord | null>(null);
    const [questions, setQuestions]: [
        PublicQuestion[],
        Dispatch<SetStateAction<PublicQuestion[]>>
    ] = useState<PublicQuestion[]>([]);
    const [drafts, setDrafts]: [
        Record<string, DraftGrade>,
        Dispatch<SetStateAction<Record<string, DraftGrade>>>
    ] = useState<Record<string, DraftGrade>>({});
    const [detailLoading, setDetailLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [saving, setSaving]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [saveMessage, setSaveMessage]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [saveError, setSaveError]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");

    const loadSubmissions: () => Promise<void> = useCallback(async (): Promise<void> => {
        if (!groupId) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            const loadedGroup: GroupSummary = await groupsApi.getById(groupId);
            setGroup(loadedGroup);
            if (!canManage(loadedGroup, user.system_role)) {
                setItems([]);
                return;
            }
            const result: PaginatedResult<SubmissionRecord> = await submissionsApi.listByGroup({
                group_id: groupId,
                page,
                limit: PAGE_LIMIT,
                grading_status: filter === "ALL" ? undefined : filter
            });
            setItems(result.items);
            setPagination(result.pagination);
        } catch (err: unknown) {
            setError(extractErrorMessage(err, "Unable to load submissions for grading."));
        } finally {
            setLoading(false);
        }
    }, [groupId, page, filter, user.system_role]);

    useEffect((): void => {
        void loadSubmissions();
    }, [loadSubmissions]);

    async function handleOpenSubmission(submissionId: string): Promise<void> {
        setDetailLoading(true);
        setSaveMessage("");
        setSaveError("");
        try {
            const record: SubmissionRecord = await submissionsApi.getById(submissionId);
            setSelected(record);

            const initialDrafts: Record<string, DraftGrade> = {};
            (record.answers ?? []).forEach((answer: SubmissionAnswer): void => {
                if (answer.question_type === "ESSAY" || answer.grading_status === "PENDING") {
                    initialDrafts[answer.question_id] = {
                        earned_points:
                            answer.earned_points !== null ? String(answer.earned_points) : "0",
                        grader_feedback: answer.grader_feedback ?? ""
                    };
                }
            });
            setDrafts(initialDrafts);

            try {
                const content: AssessmentContentResponse = await assessmentsApi.getContent(
                    record.assessment_id
                );
                setQuestions(content.questions ?? []);
            } catch {
                setQuestions([]);
            }
        } catch (err: unknown) {
            setSaveError(extractErrorMessage(err, "Unable to load submission details."));
        } finally {
            setDetailLoading(false);
        }
    }

    async function handleSaveGrades(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (!selected) {
            return;
        }

        setSaveError("");
        setSaveMessage("");

        const answersToGrade: SubmissionAnswer[] = (selected.answers ?? []).filter(
            (answer: SubmissionAnswer): boolean =>
                answer.question_type === "ESSAY" || answer.grading_status === "PENDING"
        );

        if (answersToGrade.length === 0) {
            setSaveError("No manual essay answers require grading on this submission.");
            return;
        }

        const payload: ManualGradeItem[] = [];
        for (const answer of answersToGrade) {
            const draft: DraftGrade | undefined = drafts[answer.question_id];
            const parsed: number = Number(draft?.earned_points ?? "");
            if (Number.isNaN(parsed) || parsed < 0 || parsed > answer.max_points) {
                setSaveError(
                    `Score for question must be between 0 and ${answer.max_points} points.`
                );
                return;
            }
            const feedback: string = (draft?.grader_feedback ?? "").trim();
            payload.push({
                question_id: answer.question_id,
                earned_points: parsed,
                grader_feedback: feedback || null
            });
        }

        setSaving(true);
        try {
            const updated: SubmissionRecord = await submissionsApi.gradeEssays(selected.id, payload);
            setSelected(updated);
            setSaveMessage("Manual grades saved and student score updated.");
            await loadSubmissions();
        } catch (err: unknown) {
            setSaveError(extractErrorMessage(err, "Unable to save manual grades."));
        } finally {
            setSaving(false);
        }
    }

    const questionMap: Map<string, PublicQuestion> = useMemo((): Map<string, PublicQuestion> => {
        const map: Map<string, PublicQuestion> = new Map<string, PublicQuestion>();
        questions.forEach((question: PublicQuestion): void => {
            map.set(question.id, question);
        });
        return map;
    }, [questions]);

    if (!groupId) {
        return <p className="error">Group identifier is missing.</p>;
    }

    if (!loading && group && !canManage(group, user.system_role)) {
        return (
            <div className="page-enter">
                <p className="back-link-row">
                    <Link className="link" to={`/groups/${groupId}`}>
                        <ArrowLeft size={15} /> Back to group
                    </Link>
                </p>
                <section className="panel restricted-banner" role="alert">
                    <ShieldAlert size={20} />
                    <div>
                        <h2>Access restricted</h2>
                        <p className="muted">
                            Only group owners and moderators can review and grade group submissions.
                        </p>
                    </div>
                </section>
            </div>
        );
    }

    const filters: { value: GradingFilter; label: string }[] = [
        { value: "PENDING_MANUAL", label: "Pending manual" },
        { value: "GRADED", label: "Graded" },
        { value: "ALL", label: "All submissions" }
    ];

    return (
        <div className="page-enter">
            <p className="back-link-row">
                <Link className="link" to={`/groups/${groupId}`}>
                    <ArrowLeft size={15} /> Back to {group?.name ?? "group"}
                </Link>
            </p>

            <PageTitle
                label="Grading queue"
                title={group ? `Grade submissions · ${group.name}` : "Grade submissions"}
                description="Review student responses, assign essay points, and leave constructive feedback."
            />

            {selected && (
                <section className="panel" aria-live="polite">
                    <div className="panel-head">
                        <div>
                            <p className="eyebrow">Active review</p>
                            <h2>
                                {selected.student?.display_name ?? selected.user_id} ·{" "}
                                {selected.contest?.title ?? "Assessment attempt"}
                            </h2>
                            <p className="muted">
                                Submitted {formatDate(selected.submitted_at)} · Objective:{" "}
                                {selected.objective_score ?? 0} pts · Total:{" "}
                                {selected.total_score !== null
                                    ? `${selected.total_score} / ${selected.max_score}`
                                    : `— / ${selected.max_score}`}
                            </p>
                        </div>
                        <button
                            className="button button-small"
                            type="button"
                            onClick={(): void => {
                                setSelected(null);
                                setSaveMessage("");
                                setSaveError("");
                            }}
                        >
                            Close panel
                        </button>
                    </div>

                    {saveError && (
                        <p className="error" role="alert">
                            {saveError}
                        </p>
                    )}
                    {saveMessage && (
                        <p className="notice" role="status">
                            <CheckCircle2 size={15} /> {saveMessage}
                        </p>
                    )}

                    {detailLoading ? (
                        <div className="skeleton-block" />
                    ) : (
                        <form className="stack" onSubmit={handleSaveGrades}>
                            {(selected.answers ?? []).map(
                                (answer: SubmissionAnswer, index: number): ReactNode => {
                                    const question: PublicQuestion | undefined = questionMap.get(
                                        answer.question_id
                                    );
                                    const requiresManual: boolean =
                                        answer.question_type === "ESSAY" ||
                                        answer.grading_status === "PENDING";
                                    const draft: DraftGrade = drafts[answer.question_id] ?? {
                                        earned_points: "0",
                                        grader_feedback: ""
                                    };

                                    return (
                                        <div key={answer.id} className="panel answer-review-card">
                                            <div className="panel-head">
                                                <div>
                                                    <span className="badge">
                                                        Question {question?.order ?? index + 1} ·{" "}
                                                        {answer.question_type}
                                                    </span>
                                                    <h3>
                                                        {question?.prompt ??
                                                            `Question ID: ${answer.question_id}`}
                                                    </h3>
                                                </div>
                                                <span className="badge">
                                                    Max {answer.max_points} pts
                                                </span>
                                            </div>

                                            <div>
                                                <span className="eyebrow">Student response</span>
                                                <p>
                                                    {formatAnswerText(
                                                        answer.student_response,
                                                        question?.options
                                                    )}
                                                </p>
                                            </div>

                                            {requiresManual ? (
                                                <div className="grid">
                                                    <label className="field">
                                                        <span>
                                                            Awarded points (0–{answer.max_points})
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={answer.max_points}
                                                            step="0.5"
                                                            required
                                                            value={draft.earned_points}
                                                            onChange={(e): void => {
                                                                const nextVal: string =
                                                                    e.target.value;
                                                                setDrafts(
                                                                    (
                                                                        prev: Record<
                                                                            string,
                                                                            DraftGrade
                                                                        >
                                                                    ): Record<string, DraftGrade> => ({
                                                                        ...prev,
                                                                        [answer.question_id]: {
                                                                            ...draft,
                                                                            earned_points: nextVal
                                                                        }
                                                                    })
                                                                );
                                                            }}
                                                        />
                                                    </label>
                                                    <label className="field">
                                                        <span>Grader feedback (optional)</span>
                                                        <textarea
                                                            rows={2}
                                                            value={draft.grader_feedback}
                                                            placeholder="Explain the awarded score or next steps..."
                                                            onChange={(e): void => {
                                                                const nextText: string =
                                                                    e.target.value;
                                                                setDrafts(
                                                                    (
                                                                        prev: Record<
                                                                            string,
                                                                            DraftGrade
                                                                        >
                                                                    ): Record<string, DraftGrade> => ({
                                                                        ...prev,
                                                                        [answer.question_id]: {
                                                                            ...draft,
                                                                            grader_feedback:
                                                                                nextText
                                                                        }
                                                                    })
                                                                );
                                                            }}
                                                        />
                                                    </label>
                                                </div>
                                            ) : (
                                                <p className="muted">
                                                    Auto-scored:{" "}
                                                    {answer.earned_points ?? 0} /{" "}
                                                    {answer.max_points} pts
                                                </p>
                                            )}
                                        </div>
                                    );
                                }
                            )}

                            <div className="action-row">
                                <button
                                    className="button primary"
                                    type="submit"
                                    disabled={saving}
                                >
                                    <ClipboardCheck size={16} />{" "}
                                    {saving ? "Saving grades..." : "Save manual grades"}
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            )}

            <section className="panel">
                <div className="discover-controls">
                    <div className="filter-pills" role="group" aria-label="Grading queue filter">
                        {filters.map((item: { value: GradingFilter; label: string }): ReactNode => (
                            <button
                                key={item.value}
                                type="button"
                                className={
                                    filter === item.value ? "filter-pill active" : "filter-pill"
                                }
                                onClick={(): void => {
                                    setFilter(item.value);
                                    setPage(1);
                                }}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}

                {loading ? (
                    <div className="skeleton-stack" aria-busy="true">
                        <div className="skeleton-block" />
                        <div className="skeleton-block" />
                    </div>
                ) : items.length === 0 ? (
                    <p className="empty">No submissions found for this filter.</p>
                ) : (
                    <>
                        <div className="resource-list">
                            {items.map((item: SubmissionRecord): ReactNode => (
                                <article key={item.id} className="resource-row">
                                    <div className="resource-row-main">
                                        <div className="resource-row-badges">
                                            <span className="badge">
                                                <Clock size={13} />{" "}
                                                {gradingBadgeLabel(item.grading_status)}
                                            </span>
                                            <span className="badge">{item.submission_mode}</span>
                                            {item.is_final_attempt && (
                                                <span className="badge">Final</span>
                                            )}
                                        </div>
                                        <h3 className="resource-row-title">
                                            {item.student?.display_name ?? item.user_id}
                                            {item.student?.username
                                                ? ` (@${item.student.username})`
                                                : ""}
                                        </h3>
                                        <div className="resource-row-meta">
                                            <span>
                                                {item.contest?.title ?? "Practice attempt"}
                                            </span>
                                            <span>Attempt #{item.attempt_number}</span>
                                            <span>Submitted {formatDate(item.submitted_at)}</span>
                                        </div>
                                    </div>
                                    <div className="resource-row-actions">
                                        <strong className="score-pill">
                                            {item.total_score !== null
                                                ? `${item.total_score} / ${item.max_score} pts`
                                                : `Obj ${item.objective_score ?? 0} / ${item.max_score}`}
                                        </strong>
                                        <button
                                            type="button"
                                            className="button primary button-small"
                                            onClick={(): void => {
                                                void handleOpenSubmission(item.id);
                                            }}
                                        >
                                            Review &amp; grade
                                        </button>
                                        <Link
                                            className="button button-small"
                                            to={`/submissions/${item.id}`}
                                        >
                                            Open page
                                        </Link>
                                    </div>
                                </article>
                            ))}
                        </div>

                        <Pagination
                            pagination={pagination}
                            onPageChange={setPage}
                            itemLabel="submissions"
                        />
                    </>
                )}
            </section>
        </div>
    );
}
