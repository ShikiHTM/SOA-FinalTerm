import {
    CheckCircle2,
    Clock,
    FileCheck2,
    XCircle
} from "lucide-react";
import {
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link } from "react-router-dom";
import { submissionsApi } from "../../../api/client";
import type {
    PaginatedResult,
    PaginationMeta,
    SubmissionGradingStatus,
    SubmissionMode,
    SubmissionRecord
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { PageTitle, formatDate } from "../../../shared/context";

const PAGE_LIMIT: number = 10;

type ModeFilter = "ALL" | SubmissionMode;
type StatusFilter = "ALL" | SubmissionGradingStatus;

function statusLabel(status: SubmissionGradingStatus): string {
    if (status === "PENDING_MANUAL") {
        return "Pending grading";
    }
    if (status === "AUTO_GRADED") {
        return "Auto-graded";
    }
    if (status === "GRADED") {
        return "Graded";
    }
    if (status === "FAILED") {
        return "Failed";
    }
    return "Queued";
}

function StatusIcon({ status }: { status: SubmissionGradingStatus }): ReactNode {
    if (status === "GRADED" || status === "AUTO_GRADED") {
        return <CheckCircle2 size={14} />;
    }
    if (status === "FAILED") {
        return <XCircle size={14} />;
    }
    return <Clock size={14} />;
}

export function SubmissionHistory(): ReactNode {
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
    const [modeFilter, setModeFilter]: [ModeFilter, Dispatch<SetStateAction<ModeFilter>>] =
        useState<ModeFilter>("ALL");
    const [statusFilter, setStatusFilter]: [StatusFilter, Dispatch<SetStateAction<StatusFilter>>] =
        useState<StatusFilter>("ALL");
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): (() => void) => {
        let cancelled: boolean = false;
        setLoading(true);
        setError("");

        submissionsApi
            .listMine({
                page,
                limit: PAGE_LIMIT,
                submission_mode: modeFilter === "ALL" ? undefined : modeFilter,
                grading_status: statusFilter === "ALL" ? undefined : statusFilter
            })
            .then((result: PaginatedResult<SubmissionRecord>): void => {
                if (cancelled) {
                    return;
                }
                setItems(result.items);
                setPagination(result.pagination);
            })
            .catch((err: unknown): void => {
                if (cancelled) {
                    return;
                }
                setError(extractErrorMessage(err, "Unable to load your submissions."));
            })
            .finally((): void => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return (): void => {
            cancelled = true;
        };
    }, [page, modeFilter, statusFilter]);

    const modes: ModeFilter[] = ["ALL", "CONTEST", "PRACTICE"];
    const statuses: { value: StatusFilter; label: string }[] = [
        { value: "ALL", label: "All statuses" },
        { value: "GRADED", label: "Graded" },
        { value: "AUTO_GRADED", label: "Auto-graded" },
        { value: "PENDING_MANUAL", label: "Pending manual" },
        { value: "QUEUED", label: "Queued" },
        { value: "FAILED", label: "Failed" }
    ];

    return (
        <div className="page-enter">
            <PageTitle
                label="Submissions"
                title="Submission history"
                description="Review your contest and practice attempts, scores, and manual grading feedback."
            />

            <section className="panel">
                <div className="discover-controls">
                    <div className="filter-pills" role="group" aria-label="Filter by mode">
                        {modes.map((mode: ModeFilter): ReactNode => (
                            <button
                                key={mode}
                                type="button"
                                className={modeFilter === mode ? "filter-pill active" : "filter-pill"}
                                onClick={(): void => {
                                    setModeFilter(mode);
                                    setPage(1);
                                }}
                            >
                                {mode === "ALL"
                                    ? "All modes"
                                    : mode === "CONTEST"
                                      ? "Contests"
                                      : "Practice"}
                            </button>
                        ))}
                    </div>

                    <div className="filter-pills" role="group" aria-label="Filter by grading status">
                        {statuses.map((item: { value: StatusFilter; label: string }): ReactNode => (
                            <button
                                key={item.value}
                                type="button"
                                className={
                                    statusFilter === item.value ? "filter-pill active" : "filter-pill"
                                }
                                onClick={(): void => {
                                    setStatusFilter(item.value);
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
                        <div className="skeleton-block" />
                    </div>
                ) : items.length === 0 ? (
                    <p className="empty">No submissions match the selected filters.</p>
                ) : (
                    <>
                        <div className="resource-list">
                            {items.map((item: SubmissionRecord): ReactNode => {
                                const title: string =
                                    item.contest?.title ??
                                    (item.submission_mode === "CONTEST"
                                        ? "Contest submission"
                                        : "Practice submission");
                                const scoreLabel: string =
                                    item.total_score !== null
                                        ? `${item.total_score} / ${item.max_score} pts`
                                        : `Pending / ${item.max_score} pts`;

                                return (
                                    <article key={item.id} className="resource-row">
                                        <div className="resource-row-main">
                                            <div className="resource-row-badges">
                                                <span className="badge">
                                                    {item.submission_mode === "CONTEST"
                                                        ? "Contest"
                                                        : "Practice"}
                                                </span>
                                                <span className="badge">
                                                    <StatusIcon status={item.grading_status} />{" "}
                                                    {statusLabel(item.grading_status)}
                                                </span>
                                                {item.trigger_type === "AUTO_TIMEOUT" && (
                                                    <span className="badge">Auto-timeout</span>
                                                )}
                                                {item.is_final_attempt && (
                                                    <span className="badge">Final</span>
                                                )}
                                            </div>
                                            <h2 className="resource-row-title">{title}</h2>
                                            <div className="resource-row-meta">
                                                <span>Attempt #{item.attempt_number}</span>
                                                {item.group && (
                                                    <Link to={`/groups/${item.group.id}`}>
                                                        Group: {item.group.name}
                                                    </Link>
                                                )}
                                                <span>Submitted {formatDate(item.submitted_at)}</span>
                                            </div>
                                        </div>
                                        <div className="resource-row-actions">
                                            <strong className="score-pill">
                                                <FileCheck2 size={14} /> {scoreLabel}
                                            </strong>
                                            <Link
                                                className="button button-small"
                                                to={`/submissions/${item.id}`}
                                            >
                                                View details
                                            </Link>
                                        </div>
                                    </article>
                                );
                            })}
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
