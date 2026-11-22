import {
    Ban,
    BookOpen,
    CalendarDays,
    ClipboardCheck,
    FileText,
    GraduationCap,
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
import { contestsApi, submissionsApi } from "../../../api/client";
import type { ContestSummary, SubmissionRecord } from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { canManage, formatDate, useApp } from "../../../shared/context";
import {
    getContestStatus,
    watchContestClock,
    type ContestClockStatus
} from "../utils/contestClock";

export function ContestDetail(): ReactNode {
    const { contestId }: { contestId?: string } = useParams();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const { user }: ReturnType<typeof useApp> = useApp();

    const [contest, setContest]: [
        ContestSummary | null,
        Dispatch<SetStateAction<ContestSummary | null>>
    ] = useState<ContestSummary | null>(null);
    const [submissions, setSubmissions]: [
        SubmissionRecord[],
        Dispatch<SetStateAction<SubmissionRecord[]>>
    ] = useState<SubmissionRecord[]>([]);
    const [now, setNow]: [number, Dispatch<SetStateAction<number>>] = useState<number>(Date.now);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const loadContest: () => Promise<void> = useCallback(async (): Promise<void> => {
        if (!contestId) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            const [loadedContest, mySubs] = await Promise.all([
                contestsApi.getById(contestId),
                submissionsApi.listMine({ contest_id: contestId, page: 1, limit: 20 })
            ]);
            setContest(loadedContest);
            setSubmissions(mySubs.items);
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load contest details."));
        } finally {
            setLoading(false);
        }
    }, [contestId]);

    useEffect((): void => {
        void loadContest();
    }, [loadContest]);

    useEffect((): (() => void) => {
        return watchContestClock(contest?.start_time, contest?.end_time, setNow);
    }, [contest?.end_time, contest?.start_time]);

    async function handleCancel(): Promise<void> {
        if (!contest || !window.confirm("Cancel this contest? Submissions will be closed.")) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            await contestsApi.cancel(contest.id);
            await loadContest();
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to cancel contest."));
        } finally {
            setBusy(false);
        }
    }

    async function handleDelete(): Promise<void> {
        if (!contest || !window.confirm("Delete this contest? This cannot be undone.")) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            await contestsApi.delete(contest.id);
            navigate(`/groups/${contest.group_id}`, { replace: true });
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to delete contest."));
        } finally {
            setBusy(false);
        }
    }

    if (loading && !contest) {
        return <p className="muted">Loading contest...</p>;
    }
    if (!contest) {
        return (
            <div className="page-enter">
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <p className="empty">Contest not found.</p>
            </div>
        );
    }

    const clockStatus: ContestClockStatus = getContestStatus(
        contest.start_time,
        contest.end_time,
        now
    );
    const displayStatus: string =
        contest.status === "CANCELLED"
            ? "Cancelled"
            : contest.status === "DRAFT"
              ? "Draft"
              : clockStatus;
    const managerView: boolean = contest.group
        ? canManage(contest.group, user.system_role)
        : user.system_role === "ADMIN" || contest.organizer_id === user.id;

    const canParticipate: boolean =
        contest.status === "PUBLISHED" &&
        clockStatus === "Ongoing" &&
        (contest.participation?.can_participate ?? true) &&
        (contest.submission_policy === "MULTIPLE" || submissions.length === 0);

    return (
        <div className="contest-detail-page page-enter">
            <div className="assessment-breadcrumb">
                <Link to={`/groups/${contest.group_id}`}>
                    {contest.group?.name ?? "Group"}
                </Link>
                <span>/</span>
                <span>Contest details</span>
            </div>

            <header className="assessment-hero">
                <span className="assessment-hero-icon">
                    <GraduationCap size={26} strokeWidth={1.7} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>{contest.visibility} CONTEST</span>
                        <span className="assessment-visibility">{displayStatus}</span>
                    </div>
                    <h1>{contest.title}</h1>
                    <p>{contest.description || "Scheduled group competition."}</p>
                    <div className="contest-meta-links">
                        <Link className="assessment-group-link" to={`/groups/${contest.group_id}`}>
                            <Users size={15} /> {contest.group?.name ?? "Owning group"}
                        </Link>
                        {contest.organizer && (
                            <Link
                                className="assessment-group-link"
                                to={`/users/${encodeURIComponent(contest.organizer.username)}`}
                            >
                                Host: {contest.organizer.display_name}
                            </Link>
                        )}
                    </div>
                </div>
                {managerView && (
                    <div className="assessment-hero-actions">
                        {contest.status !== "CANCELLED" && clockStatus !== "Ended" && (
                            <button
                                className="button button-small"
                                type="button"
                                disabled={busy}
                                onClick={(): void => {
                                    void handleCancel();
                                }}
                            >
                                <Ban size={14} /> Cancel
                            </button>
                        )}
                        {clockStatus !== "Ongoing" && (
                            <button
                                className="icon-button"
                                type="button"
                                aria-label="Delete contest"
                                title="Delete contest"
                                disabled={busy}
                                onClick={(): void => {
                                    void handleDelete();
                                }}
                            >
                                <Trash2 size={17} />
                            </button>
                        )}
                    </div>
                )}
            </header>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            <div className="assessment-workspace">
                <div className="contest-content">
                    <section className="assessment-section">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">SCHEDULE &amp; RULES</p>
                                <h2>Contest details</h2>
                                <p>Review the active window and attempt policy before starting.</p>
                            </div>
                        </div>
                        <div className="contest-facts">
                            <div>
                                <span className="contest-fact-icon">
                                    <CalendarDays size={18} />
                                </span>
                                <span>
                                    <small>STARTS</small>
                                    <strong>{formatDate(contest.start_time)}</strong>
                                </span>
                            </div>
                            <div>
                                <span className="contest-fact-icon">
                                    <CalendarDays size={18} />
                                </span>
                                <span>
                                    <small>ENDS</small>
                                    <strong>{formatDate(contest.end_time)}</strong>
                                </span>
                            </div>
                            <div>
                                <span className="contest-fact-icon">
                                    <FileText size={18} />
                                </span>
                                <span>
                                    <small>POLICY</small>
                                    <strong>
                                        {contest.submission_policy === "MULTIPLE"
                                            ? "Multiple · final scored"
                                            : "Single attempt"}
                                    </strong>
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className="assessment-section">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">YOUR SUBMISSIONS</p>
                                <h2>Submitted attempts</h2>
                                <p>Track grading status and scores for this contest.</p>
                            </div>
                            <span className="assessment-count">{submissions.length} attempts</span>
                        </div>
                        {submissions.length > 0 ? (
                            <div className="contest-submission-list">
                                {submissions.map(
                                    (item: SubmissionRecord): ReactNode => (
                                        <Link
                                            className="contest-submission"
                                            to={`/submissions/${item.id}`}
                                            key={item.id}
                                        >
                                            <span className="contest-submission-icon">
                                                <ClipboardCheck size={18} />
                                            </span>
                                            <span>
                                                <strong>
                                                    Attempt #{item.attempt_number} ·{" "}
                                                    {item.grading_status}
                                                    {item.total_score !== null &&
                                                        ` · ${item.total_score}/${item.max_score}`}
                                                </strong>
                                                <small>
                                                    Submitted {formatDate(item.submitted_at)}
                                                </small>
                                            </span>
                                            <span className="contest-submission-link">
                                                View submission
                                            </span>
                                        </Link>
                                    )
                                )}
                            </div>
                        ) : (
                            <div className="assessment-placeholder">
                                <ClipboardCheck size={21} />
                                <div>
                                    <strong>No submissions yet</strong>
                                    <p>Your submitted attempts will appear here.</p>
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <aside className="assessment-side">
                    <section className="assessment-section assessment-info">
                        <div className="assessment-section-heading">
                            <div>
                                <p className="assessment-section-kicker">LINKED ASSESSMENT</p>
                                <h2>Package summary</h2>
                            </div>
                        </div>
                        <dl className="assessment-info-list">
                            <div>
                                <dt>Group</dt>
                                <dd>{contest.group?.name ?? contest.group_id}</dd>
                            </div>
                            <div>
                                <dt>Version</dt>
                                <dd>v{contest.assessment_version}</dd>
                            </div>
                            {contest.assessment && (
                                <>
                                    <div>
                                        <dt>Questions</dt>
                                        <dd>{contest.assessment.question_count}</dd>
                                    </div>
                                    <div>
                                        <dt>Total points</dt>
                                        <dd>{contest.assessment.total_points}</dd>
                                    </div>
                                    <div>
                                        <dt>Type</dt>
                                        <dd>{contest.assessment.assessment_type}</dd>
                                    </div>
                                </>
                            )}
                            <div>
                                <dt>Status</dt>
                                <dd>{displayStatus}</dd>
                            </div>
                        </dl>
                        {(managerView || contest.assessment?.is_practice_enabled) && (
                            <Link
                                className="contest-exam-link"
                                to={`/assessments/${contest.assessment_id}`}
                            >
                                View assessment metadata
                            </Link>
                        )}
                    </section>

                    <section className="assessment-section assessment-start">
                        <span className="assessment-start-icon">
                            <BookOpen size={21} />
                        </span>
                        <h2>Ready to compete?</h2>
                        <p>
                            {canParticipate
                                ? "Your in-progress answers are backed up locally in this browser until submission."
                                : contest.participation?.denial_reason
                                  ? `Eligibility notice: ${contest.participation.denial_reason}`
                                  : submissions.length > 0 &&
                                      contest.submission_policy === "SINGLE"
                                    ? "You have already used your single submission attempt for this contest."
                                    : "Submissions are only open while a published contest is ongoing."}
                        </p>
                        {canParticipate && (
                            <Link
                                className="button primary assessment-practice-button"
                                to={`/contests/${contest.id}/attempt`}
                            >
                                Start attempt
                            </Link>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}
