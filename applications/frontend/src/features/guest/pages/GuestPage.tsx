import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CalendarDays,
    Globe2,
    GraduationCap,
    LockKeyhole,
    Search,
    Users
} from "lucide-react";
import {
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useParams } from "react-router-dom";
import { contestsApi, groupsApi } from "../../../api/client";
import type {
    ContestPhase,
    ContestSummary,
    GroupSummary,
    GroupVisibility,
    PaginatedResult
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { formatDate, formatShortDate } from "../../../shared/context";

type GuestPageProps = {
    themeControl: ReactNode;
};

const PAGE_LIMIT: number = 8;

export function GuestPage({ themeControl }: GuestPageProps): ReactNode {
    const { groupId, contestId }: { groupId?: string; contestId?: string } = useParams();
    const [activeTab, setActiveTab]: [
        "groups" | "contests",
        Dispatch<SetStateAction<"groups" | "contests">>
    ] = useState<"groups" | "contests">("groups");

    const [groupSearchInput, setGroupSearchInput]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [groupSearch, setGroupSearch]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [groupVisibility, setGroupVisibility]: [
        GroupVisibility | "ALL",
        Dispatch<SetStateAction<GroupVisibility | "ALL">>
    ] = useState<GroupVisibility | "ALL">("ALL");
    const [groupPage, setGroupPage]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(1);
    const [groupsResult, setGroupsResult]: [
        PaginatedResult<GroupSummary> | null,
        Dispatch<SetStateAction<PaginatedResult<GroupSummary> | null>>
    ] = useState<PaginatedResult<GroupSummary> | null>(null);

    const [contestSearchInput, setContestSearchInput]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [contestSearch, setContestSearch]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [contestPhase, setContestPhase]: [
        ContestPhase | "ALL",
        Dispatch<SetStateAction<ContestPhase | "ALL">>
    ] = useState<ContestPhase | "ALL">("ALL");
    const [contestPage, setContestPage]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(1);
    const [contestsResult, setContestsResult]: [
        PaginatedResult<ContestSummary> | null,
        Dispatch<SetStateAction<PaginatedResult<ContestSummary> | null>>
    ] = useState<PaginatedResult<ContestSummary> | null>(null);

    const [selectedGroup, setSelectedGroup]: [
        GroupSummary | null,
        Dispatch<SetStateAction<GroupSummary | null>>
    ] = useState<GroupSummary | null>(null);
    const [selectedContest, setSelectedContest]: [
        ContestSummary | null,
        Dispatch<SetStateAction<ContestSummary | null>>
    ] = useState<ContestSummary | null>(null);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        if (groupId) {
            setLoading(true);
            setError("");
            void groupsApi
                .getById(groupId)
                .then((res): void => setSelectedGroup(res))
                .catch((reason: unknown): void => {
                    setError(extractErrorMessage(reason, "Unable to load group details."));
                })
                .finally((): void => setLoading(false));
            return;
        }
        if (contestId) {
            setLoading(true);
            setError("");
            void contestsApi
                .getById(contestId)
                .then((res): void => setSelectedContest(res))
                .catch((reason: unknown): void => {
                    setError(extractErrorMessage(reason, "Unable to load contest details."));
                })
                .finally((): void => setLoading(false));
            return;
        }
        setSelectedGroup(null);
        setSelectedContest(null);
    }, [contestId, groupId]);

    useEffect((): void => {
        if (groupId || contestId) {
            return;
        }
        setLoading(true);
        setError("");
        void groupsApi
            .list({
                page: groupPage,
                limit: PAGE_LIMIT,
                search: groupSearch || undefined,
                visibility: groupVisibility === "ALL" ? undefined : groupVisibility
            })
            .then((res): void => setGroupsResult(res))
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load groups."));
            })
            .finally((): void => setLoading(false));
    }, [contestId, groupId, groupPage, groupSearch, groupVisibility]);

    useEffect((): void => {
        if (groupId || contestId) {
            return;
        }
        if (activeTab === "contests") {
            setLoading(true);
        }
        void contestsApi
            .list({
                page: contestPage,
                limit: PAGE_LIMIT,
                visibility: "PUBLIC",
                phase: contestPhase === "ALL" ? undefined : contestPhase,
                search: contestSearch || undefined
            })
            .then((res): void => setContestsResult(res))
            .catch((reason: unknown): void => {
                if (activeTab === "contests") {
                    setError(extractErrorMessage(reason, "Unable to load contests."));
                }
            })
            .finally((): void => {
                if (activeTab === "contests") {
                    setLoading(false);
                }
            });
    }, [activeTab, contestId, contestPage, contestPhase, contestSearch, groupId]);

    function submitGroupSearch(event: FormEvent): void {
        event.preventDefault();
        setGroupPage(1);
        setGroupSearch(groupSearchInput.trim());
    }

    function submitContestSearch(event: FormEvent): void {
        event.preventDefault();
        setContestPage(1);
        setContestSearch(contestSearchInput.trim());
    }

    const totalGroupsCount: number = groupsResult?.pagination.total ?? 0;
    const totalContestsCount: number = contestsResult?.pagination.total ?? 0;

    return (
        <div className="guest-page">
            <header className="top guest-header">
                <Link className="brand" to="/discover" aria-label="LMS - Discover">
                    <span className="brand-icon">
                        <BookOpen size={19} strokeWidth={2.2} />
                    </span>
                    <span className="brand-name">
                        lms<span>.</span>
                    </span>
                </Link>
                <span className="top-subtitle">Learning Workspace</span>
                <div className="top-right guest-header-actions">
                    {themeControl}
                    <Link className="button primary" to="/login">
                        Sign in <ArrowRight size={16} />
                    </Link>
                </div>
            </header>

            <main className="main guest-main page-enter">
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}

                {(groupId || contestId) && (
                    <Link className="guest-back" to="/discover">
                        <ArrowLeft size={16} /> Back to Discover
                    </Link>
                )}

                {loading && !selectedGroup && !selectedContest && (groupId || contestId) && (
                    <p className="muted">Loading details...</p>
                )}

                {groupId && selectedGroup && (
                    <section className="guest-detail">
                        <div className="guest-detail-heading">
                            <span className="guest-detail-icon">
                                <Users size={25} />
                            </span>
                            <div>
                                <p className="eyebrow">LEARNING GROUP</p>
                                <h1>{selectedGroup.name}</h1>
                                <p>{selectedGroup.description || "No group description provided."}</p>
                            </div>
                        </div>
                        <div className="panel guest-detail-panel">
                            <h2>Group overview</h2>
                            <div className="guest-detail-row">
                                <span>Visibility</span>
                                <strong>{selectedGroup.visibility}</strong>
                            </div>
                            <div className="guest-detail-row">
                                <span>Join policy</span>
                                <strong>{selectedGroup.join_policy}</strong>
                            </div>
                            <div className="guest-detail-row">
                                <span>Members</span>
                                <strong>{selectedGroup.member_count}</strong>
                            </div>
                            <div className="guest-detail-row">
                                <span>Group code</span>
                                <strong>{selectedGroup.group_code}</strong>
                            </div>
                            {selectedGroup.owner && (
                                <div className="guest-detail-row">
                                    <span>Owner</span>
                                    <strong>{selectedGroup.owner.display_name}</strong>
                                </div>
                            )}
                            <p className="guest-detail-hint">
                                Sign in to join this group and participate in contests and group
                                practice.
                            </p>
                            <Link className="button primary" to="/login">
                                Sign in to join <ArrowRight size={16} />
                            </Link>
                        </div>
                    </section>
                )}

                {contestId && selectedContest && (
                    <section className="guest-detail">
                        <div className="guest-detail-heading">
                            <span className="guest-detail-icon">
                                <GraduationCap size={25} />
                            </span>
                            <div>
                                <p className="eyebrow">PUBLIC CONTEST</p>
                                <h1>{selectedContest.title}</h1>
                                <p>{selectedContest.group?.name ?? "Community Contest"}</p>
                            </div>
                        </div>
                        <div className="panel guest-detail-panel">
                            <h2>Contest schedule &amp; rules</h2>
                            <div className="guest-detail-row">
                                <span>Phase</span>
                                <strong>{selectedContest.phase}</strong>
                            </div>
                            <div className="guest-detail-row">
                                <span>Starts</span>
                                <strong>{formatDate(selectedContest.start_time)}</strong>
                            </div>
                            <div className="guest-detail-row">
                                <span>Ends</span>
                                <strong>{formatDate(selectedContest.end_time)}</strong>
                            </div>
                            <div className="guest-detail-row">
                                <span>Attempts</span>
                                <strong>
                                    {selectedContest.submission_policy === "MULTIPLE"
                                        ? "Multiple (final attempt scored)"
                                        : "Single attempt"}
                                </strong>
                            </div>
                            {selectedContest.organizer && (
                                <div className="guest-detail-row">
                                    <span>Organizer</span>
                                    <strong>{selectedContest.organizer.display_name}</strong>
                                </div>
                            )}
                            <p className="guest-detail-hint">
                                Sign in to join the contest and record your submission results.
                            </p>
                            <Link className="button primary" to="/login">
                                Sign in to participate <ArrowRight size={16} />
                            </Link>
                        </div>
                    </section>
                )}

                {!groupId && !contestId && (
                    <div className="dashboard guest-discover">
                        <section className="dashboard-welcome guest-welcome">
                            <div className="welcome-copy">
                                <p className="welcome-kicker">
                                    <span /> PUBLIC LEARNING SPACE
                                </p>
                                <h1>
                                    Learn together.
                                    <br />
                                    <span>Grow every day.</span>
                                </h1>
                                <p>
                                    Explore active study groups and join scheduled community
                                    contests.
                                </p>
                                <Link className="button primary guest-welcome-action" to="/login">
                                    Get started <ArrowRight size={16} />
                                </Link>
                            </div>
                            <div className="welcome-summary guest-summary">
                                <span className="summary-icon">
                                    <GraduationCap size={23} />
                                </span>
                                <div>
                                    <strong>
                                        {activeTab === "groups"
                                            ? totalGroupsCount
                                            : totalContestsCount}
                                    </strong>
                                    <span>
                                        {activeTab === "groups"
                                            ? "learning groups"
                                            : "public contests"}
                                    </span>
                                </div>
                            </div>
                        </section>

                        <div className="tabs guest-discover-tabs" role="tablist" aria-label="Discover">
                            <button
                                className={activeTab === "groups" ? "active" : ""}
                                id="guest-groups-tab"
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "groups"}
                                aria-controls="guest-groups-panel"
                                onClick={(): void => setActiveTab("groups")}
                            >
                                Groups
                            </button>
                            <button
                                className={activeTab === "contests" ? "active" : ""}
                                id="guest-contests-tab"
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "contests"}
                                aria-controls="guest-contests-panel"
                                onClick={(): void => setActiveTab("contests")}
                            >
                                Contests
                            </button>
                        </div>

                        {activeTab === "groups" ? (
                            <section
                                id="guest-groups-panel"
                                className="discover-section guest-section"
                                role="tabpanel"
                                aria-labelledby="guest-groups-tab"
                            >
                                <div className="discover-heading">
                                    <div>
                                        <p className="eyebrow">COMMUNITIES</p>
                                        <h2>Explore groups</h2>
                                        <p>Find a group to collaborate and access contests.</p>
                                    </div>
                                    <span className="result-count">{totalGroupsCount} groups</span>
                                </div>
                                <div className="discover-controls">
                                    <form className="home-search-field" onSubmit={submitGroupSearch}>
                                        <Search size={18} aria-hidden="true" />
                                        <input
                                            type="search"
                                            aria-label="Search groups by name or description"
                                            placeholder="Search groups by name or code..."
                                            value={groupSearchInput}
                                            onChange={(event): void => {
                                                const next: string = event.target.value;
                                                setGroupSearchInput(next);
                                                if (next === "") {
                                                    setGroupPage(1);
                                                    setGroupSearch("");
                                                }
                                            }}
                                        />
                                    </form>
                                    <div className="exam-filters" aria-label="Filter groups by visibility">
                                        {(["ALL", "PUBLIC", "PRIVATE"] as const).map(
                                            (value): ReactNode => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    aria-pressed={groupVisibility === value}
                                                    className={
                                                        groupVisibility === value ? "selected" : ""
                                                    }
                                                    onClick={(): void => {
                                                        setGroupVisibility(value);
                                                        setGroupPage(1);
                                                    }}
                                                >
                                                    {value === "ALL"
                                                        ? "All"
                                                        : value === "PUBLIC"
                                                          ? "Public"
                                                          : "Private"}
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>
                                {loading && !groupsResult ? (
                                    <p className="muted">Loading groups...</p>
                                ) : groupsResult && groupsResult.items.length > 0 ? (
                                    <>
                                        <ul className="resource-list">
                                            {groupsResult.items.map(
                                                (item: GroupSummary): ReactNode => (
                                                    <li key={item.id}>
                                                        <Link
                                                            className="resource-row"
                                                            to={`/discover/groups/${item.id}`}
                                                        >
                                                            <span className="resource-row-icon">
                                                                <Users size={18} />
                                                            </span>
                                                            <div className="resource-row-main">
                                                                <div className="resource-row-title">
                                                                    <strong>{item.name}</strong>
                                                                    <span className="badge">
                                                                        {item.visibility ===
                                                                        "PUBLIC" ? (
                                                                            <Globe2 size={12} />
                                                                        ) : (
                                                                            <LockKeyhole size={12} />
                                                                        )}
                                                                        {item.visibility ===
                                                                        "PUBLIC"
                                                                            ? "Public"
                                                                            : "Private"}
                                                                    </span>
                                                                </div>
                                                                <p>
                                                                    {item.description ||
                                                                        "Collaborative learning space."}
                                                                </p>
                                                                <div className="resource-row-meta">
                                                                    <span>
                                                                        Code: {item.group_code}
                                                                    </span>
                                                                    <span>
                                                                        {item.member_count} members
                                                                    </span>
                                                                    {item.owner && (
                                                                        <span>
                                                                            Owner:{" "}
                                                                            {
                                                                                item.owner
                                                                                    .display_name
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="resource-row-cta">
                                                                View group <ArrowRight size={14} />
                                                            </span>
                                                        </Link>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                        <Pagination
                                            pagination={groupsResult.pagination}
                                            onPageChange={setGroupPage}
                                            itemLabel="groups"
                                        />
                                    </>
                                ) : (
                                    <div className="empty dashboard-empty">
                                        <Users size={23} />
                                        <h3>No matching groups</h3>
                                        <p>Try another keyword or visibility filter.</p>
                                    </div>
                                )}
                            </section>
                        ) : (
                            <section
                                id="guest-contests-panel"
                                className="discover-section guest-section"
                                role="tabpanel"
                                aria-labelledby="guest-contests-tab"
                            >
                                <div className="discover-heading">
                                    <div>
                                        <p className="eyebrow">CHALLENGES</p>
                                        <h2>Public contests</h2>
                                        <p>Scheduled competitions open across the platform.</p>
                                    </div>
                                    <span className="result-count">
                                        {totalContestsCount} contests
                                    </span>
                                </div>
                                <div className="discover-controls">
                                    <form
                                        className="home-search-field"
                                        onSubmit={submitContestSearch}
                                    >
                                        <Search size={18} aria-hidden="true" />
                                        <input
                                            type="search"
                                            aria-label="Search contests by title"
                                            placeholder="Search contests by title..."
                                            value={contestSearchInput}
                                            onChange={(event): void => {
                                                const next: string = event.target.value;
                                                setContestSearchInput(next);
                                                if (next === "") {
                                                    setContestPage(1);
                                                    setContestSearch("");
                                                }
                                            }}
                                        />
                                    </form>
                                    <div className="exam-filters" aria-label="Filter contests by phase">
                                        {(
                                            ["ALL", "ONGOING", "UPCOMING", "ENDED"] as const
                                        ).map(
                                            (value): ReactNode => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    aria-pressed={contestPhase === value}
                                                    className={
                                                        contestPhase === value ? "selected" : ""
                                                    }
                                                    onClick={(): void => {
                                                        setContestPhase(value);
                                                        setContestPage(1);
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
                                {loading && !contestsResult ? (
                                    <p className="muted">Loading contests...</p>
                                ) : contestsResult && contestsResult.items.length > 0 ? (
                                    <>
                                        <ul className="resource-list">
                                            {contestsResult.items.map(
                                                (item: ContestSummary): ReactNode => (
                                                    <li key={item.id}>
                                                        <Link
                                                            className="resource-row"
                                                            to={`/discover/contests/${item.id}`}
                                                        >
                                                            <span className="resource-row-icon">
                                                                <GraduationCap size={18} />
                                                            </span>
                                                            <div className="resource-row-main">
                                                                <div className="resource-row-title">
                                                                    <strong>{item.title}</strong>
                                                                    <span className="badge">
                                                                        {item.phase}
                                                                    </span>
                                                                </div>
                                                                <p>
                                                                    {item.description ||
                                                                        "Scheduled assessment contest."}
                                                                </p>
                                                                <div className="resource-row-meta">
                                                                    <span>
                                                                        <CalendarDays size={13} />{" "}
                                                                        {formatShortDate(
                                                                            item.start_time
                                                                        )}{" "}
                                                                        —{" "}
                                                                        {formatShortDate(
                                                                            item.end_time
                                                                        )}
                                                                    </span>
                                                                    <span>
                                                                        {item.submission_policy ===
                                                                        "MULTIPLE"
                                                                            ? "Multiple attempts"
                                                                            : "Single attempt"}
                                                                    </span>
                                                                    {item.organizer && (
                                                                        <span>
                                                                            Host:{" "}
                                                                            {
                                                                                item.organizer
                                                                                    .display_name
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="resource-row-cta">
                                                                View contest{" "}
                                                                <ArrowRight size={14} />
                                                            </span>
                                                        </Link>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                        <Pagination
                                            pagination={contestsResult.pagination}
                                            onPageChange={setContestPage}
                                            itemLabel="contests"
                                        />
                                    </>
                                ) : (
                                    <div className="empty dashboard-empty">
                                        <CalendarDays size={23} />
                                        <h3>No public contests</h3>
                                        <p>Check back later for upcoming community contests.</p>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
