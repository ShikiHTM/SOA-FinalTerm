import { ArrowRight, CalendarDays, GraduationCap, Plus, Search } from "lucide-react";
import {
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link } from "react-router-dom";
import { contestsApi } from "../../../api/client";
import type { ContestPhase, ContestSummary, PaginatedResult } from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { formatShortDate, PageTitle } from "../../../shared/context";

const PAGE_LIMIT: number = 8;

export function Contests(): ReactNode {
    const [phase, setPhase]: [ContestPhase | "ALL", Dispatch<SetStateAction<ContestPhase | "ALL">>] =
        useState<ContestPhase | "ALL">("ALL");
    const [searchInput, setSearchInput]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [search, setSearch]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [page, setPage]: [number, Dispatch<SetStateAction<number>>] = useState<number>(1);
    const [result, setResult]: [
        PaginatedResult<ContestSummary> | null,
        Dispatch<SetStateAction<PaginatedResult<ContestSummary> | null>>
    ] = useState<PaginatedResult<ContestSummary> | null>(null);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        setLoading(true);
        setError("");
        void contestsApi
            .list({
                page,
                limit: PAGE_LIMIT,
                phase: phase === "ALL" ? undefined : phase,
                search: search || undefined
            })
            .then((res): void => setResult(res))
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load contests."));
            })
            .finally((): void => setLoading(false));
    }, [page, phase, search]);

    function handleSearch(event: FormEvent): void {
        event.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
    }

    return (
        <div className="page-enter">
            <PageTitle
                label="COMPETITIONS"
                title="Contests"
                description="View public contests and scheduled competitions across your groups."
                action={
                    <Link className="button primary" to="/contests/new">
                        <Plus size={16} /> Create contest
                    </Link>
                }
            />
            <div className="discover-controls">
                <form className="home-search-field" onSubmit={handleSearch}>
                    <Search size={18} aria-hidden="true" />
                    <input
                        type="search"
                        aria-label="Search contests"
                        placeholder="Search contests by title..."
                        value={searchInput}
                        onChange={(event): void => {
                            const next: string = event.target.value;
                            setSearchInput(next);
                            if (next === "") {
                                setPage(1);
                                setSearch("");
                            }
                        }}
                    />
                </form>
                <div className="exam-filters" aria-label="Filter by phase">
                    {(["ALL", "ONGOING", "UPCOMING", "ENDED"] as const).map(
                        (value): ReactNode => (
                            <button
                                key={value}
                                type="button"
                                className={phase === value ? "selected" : ""}
                                onClick={(): void => {
                                    setPhase(value);
                                    setPage(1);
                                }}
                            >
                                {value === "ALL"
                                    ? "All"
                                    : value === "ONGOING"
                                      ? "Ongoing"
                                      : value === "UPCOMING"
                                        ? "Upcoming"
                                        : "Ended"}
                            </button>
                        )
                    )}
                </div>
            </div>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {loading && !result ? (
                <p className="muted">Loading contests...</p>
            ) : result && result.items.length > 0 ? (
                <>
                    <ul className="resource-list">
                        {result.items.map(
                            (contest: ContestSummary): ReactNode => (
                                <li key={contest.id}>
                                    <Link className="resource-row" to={`/contests/${contest.id}`}>
                                        <span className="resource-row-icon">
                                            <GraduationCap size={18} />
                                        </span>
                                        <div className="resource-row-main">
                                            <div className="resource-row-title">
                                                <strong>{contest.title}</strong>
                                                <span className="badge">{contest.phase}</span>
                                                <span className="badge">{contest.visibility}</span>
                                            </div>
                                            <p>
                                                {contest.description ||
                                                    "Scheduled group assessment contest."}
                                            </p>
                                            <div className="resource-row-meta">
                                                <span>
                                                    <CalendarDays size={13} />{" "}
                                                    {formatShortDate(contest.start_time)} —{" "}
                                                    {formatShortDate(contest.end_time)}
                                                </span>
                                                <span>
                                                    {contest.submission_policy === "MULTIPLE"
                                                        ? "Multiple attempts"
                                                        : "Single attempt"}
                                                </span>
                                                {contest.organizer && (
                                                    <span>
                                                        Host: {contest.organizer.display_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="resource-row-cta">
                                            View details <ArrowRight size={14} />
                                        </span>
                                    </Link>
                                </li>
                            )
                        )}
                    </ul>
                    <Pagination
                        pagination={result.pagination}
                        onPageChange={setPage}
                        itemLabel="contests"
                    />
                </>
            ) : (
                <div className="empty dashboard-empty">
                    <CalendarDays size={23} />
                    <h3>No contests found</h3>
                    <p>Adjust your filters or schedule a contest inside one of your managed groups.</p>
                </div>
            )}
        </div>
    );
}
