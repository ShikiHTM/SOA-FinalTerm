import {
    ArrowRight,
    BookOpen,
    CalendarDays,
    ClipboardList,
    Globe2,
    GraduationCap,
    Heart,
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
import { Link } from "react-router-dom";
import {
    assessmentsApi,
    contestsApi,
    groupsApi,
    submissionsApi
} from "../../../api/client";
import type {
    AssessmentMetadata,
    ContestPhase,
    ContestSummary,
    GroupSummary,
    GroupVisibility,
    PaginatedResult
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { formatShortDate, useApp } from "../../../shared/context";

type DashboardTab = "groups" | "contests" | "practice";
const PAGE_LIMIT: number = 8;

export function Dashboard(): ReactNode {
    const { user }: ReturnType<typeof useApp> = useApp();
    const [activeTab, setActiveTab]: [DashboardTab, Dispatch<SetStateAction<DashboardTab>>] =
        useState<DashboardTab>("groups");

    const [joinedTotal, setJoinedTotal]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(0);
    const [submissionTotal, setSubmissionTotal]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(0);
    const [favoritesTotal, setFavoritesTotal]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(0);

    const [groupScope, setGroupScope]: ["all" | "mine", Dispatch<SetStateAction<"all" | "mine">>] =
        useState<"all" | "mine">("all");
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

    const [joinedGroups, setJoinedGroups]: [GroupSummary[], Dispatch<SetStateAction<GroupSummary[]>>] =
        useState<GroupSummary[]>([]);
    const [practiceGroupId, setPracticeGroupId]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [practiceSearchInput, setPracticeSearchInput]: [
        string,
        Dispatch<SetStateAction<string>>
    ] = useState<string>("");
    const [practiceSearch, setPracticeSearch]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [practicePage, setPracticePage]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(1);
    const [practiceResult, setPracticeResult]: [
        PaginatedResult<AssessmentMetadata> | null,
        Dispatch<SetStateAction<PaginatedResult<AssessmentMetadata> | null>>
    ] = useState<PaginatedResult<AssessmentMetadata> | null>(null);

    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        void Promise.all([
            groupsApi.listMine({ page: 1, limit: 50 }),
            submissionsApi.listMine({ page: 1, limit: 1 }),
            assessmentsApi.listFavorites({ page: 1, limit: 1 })
        ])
            .then(([myGroupsRes, mySubsRes, favRes]): void => {
                setJoinedGroups(myGroupsRes.items);
                setJoinedTotal(myGroupsRes.pagination.total);
                setSubmissionTotal(mySubsRes.pagination.total);
                setFavoritesTotal(favRes.pagination.total);
                if (myGroupsRes.items.length > 0) {
                    setPracticeGroupId((current: string): string =>
                        current || myGroupsRes.items[0].id
                    );
                }
            })
            .catch((): void => {
                return;
            });
    }, []);

    useEffect((): void => {
        if (activeTab !== "groups") {
            return;
        }
        setLoading(true);
        setError("");
        const request: Promise<PaginatedResult<GroupSummary>> =
            groupScope === "mine"
                ? groupsApi.listMine({ page: groupPage, limit: PAGE_LIMIT })
                : groupsApi.list({
                      page: groupPage,
                      limit: PAGE_LIMIT,
                      search: groupSearch || undefined,
                      visibility: groupVisibility === "ALL" ? undefined : groupVisibility
                  });
        void request
            .then((res): void => setGroupsResult(res))
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load groups."));
            })
            .finally((): void => setLoading(false));
    }, [activeTab, groupPage, groupScope, groupSearch, groupVisibility]);

    useEffect((): void => {
        if (activeTab !== "contests") {
            return;
        }
        setLoading(true);
        setError("");
        void contestsApi
            .list({
                page: contestPage,
                limit: PAGE_LIMIT,
                phase: contestPhase === "ALL" ? undefined : contestPhase,
                search: contestSearch || undefined
            })
            .then((res): void => setContestsResult(res))
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load contests."));
            })
            .finally((): void => setLoading(false));
    }, [activeTab, contestPage, contestPhase, contestSearch]);

    useEffect((): void => {
        if (activeTab !== "practice" || !practiceGroupId) {
            return;
        }
        setLoading(true);
        setError("");
        void assessmentsApi
            .listByGroup({
                group_id: practiceGroupId,
                page: practicePage,
                limit: PAGE_LIMIT,
                is_practice_enabled: true,
                search: practiceSearch || undefined
            })
            .then((res): void => setPracticeResult(res))
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load practice assessments."));
            })
            .finally((): void => setLoading(false));
    }, [activeTab, practiceGroupId, practicePage, practiceSearch]);

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

    function submitPracticeSearch(event: FormEvent): void {
        event.preventDefault();
        setPracticePage(1);
        setPracticeSearch(practiceSearchInput.trim());
    }

    return (
        <div className="dashboard page-enter">
            <section className="dashboard-welcome" aria-label="Workspace overview">
                <div className="welcome-copy">
                    <p className="welcome-kicker">
                        <span /> YOUR LEARNING SPACE
                    </p>
                    <h1>
                        Welcome back, <span>{user.display_name}</span>
                    </h1>
                    <p>
                        Explore your learning groups, join scheduled contests, and review practice
                        sets released by your groups.
                    </p>
                </div>
                <div className="dashboard-summary-row">
                    <Link className="welcome-summary" to="/groups">
                        <span className="summary-icon">
                            <Users size={21} />
                        </span>
                        <div>
                            <strong>{joinedTotal}</strong>
                            <span>joined groups</span>
                        </div>
                    </Link>
                    <Link className="welcome-summary" to="/submissions">
                        <span className="summary-icon">
                            <ClipboardList size={21} />
                        </span>
                        <div>
                            <strong>{submissionTotal}</strong>
                            <span>submissions</span>
                        </div>
                    </Link>
                    <Link className="welcome-summary" to="/favorites">
                        <span className="summary-icon">
                            <Heart size={21} />
                        </span>
                        <div>
                            <strong>{favoritesTotal}</strong>
                            <span>favorites</span>
                        </div>
                    </Link>
                </div>
            </section>

            <div className="tabs" role="tablist" aria-label="Workspace sections">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "groups"}
                    className={activeTab === "groups" ? "active" : ""}
                    onClick={(): void => setActiveTab("groups")}
                >
                    Groups
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "contests"}
                    className={activeTab === "contests" ? "active" : ""}
                    onClick={(): void => setActiveTab("contests")}
                >
                    Contests
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "practice"}
                    className={activeTab === "practice" ? "active" : ""}
                    onClick={(): void => setActiveTab("practice")}
                >
                    Practice
                </button>
            </div>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {activeTab === "groups" && (
                <section className="discover-section" role="tabpanel">
                    <div className="discover-heading">
                        <div>
                            <p className="eyebrow">COMMUNITIES</p>
                            <h2>Learning groups</h2>
                            <p>Browse active groups or jump back into groups you already joined.</p>
                        </div>
                        <Link className="button primary" to="/groups/new">
                            Create group
                        </Link>
                    </div>
                    <div className="discover-controls">
                        <form className="home-search-field" onSubmit={submitGroupSearch}>
                            <Search size={18} aria-hidden="true" />
                            <input
                                type="search"
                                disabled={groupScope === "mine"}
                                aria-label="Search groups"
                                placeholder={
                                    groupScope === "mine"
                                        ? "Switch to All groups to search by keyword or code"
                                        : "Search groups by name or code..."
                                }
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
                        <div className="exam-filters">
                            <button
                                type="button"
                                className={groupScope === "all" ? "selected" : ""}
                                onClick={(): void => {
                                    setGroupScope("all");
                                    setGroupPage(1);
                                }}
                            >
                                All groups
                            </button>
                            <button
                                type="button"
                                className={groupScope === "mine" ? "selected" : ""}
                                onClick={(): void => {
                                    setGroupScope("mine");
                                    setGroupPage(1);
                                }}
                            >
                                My groups
                            </button>
                            {groupScope === "all" &&
                                (["PUBLIC", "PRIVATE"] as const).map(
                                    (vis): ReactNode => (
                                        <button
                                            key={vis}
                                            type="button"
                                            className={groupVisibility === vis ? "selected" : ""}
                                            onClick={(): void => {
                                                setGroupVisibility(
                                                    groupVisibility === vis ? "ALL" : vis
                                                );
                                                setGroupPage(1);
                                            }}
                                        >
                                            {vis === "PUBLIC" ? "Public" : "Private"}
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
                                            <Link className="resource-row" to={`/groups/${item.id}`}>
                                                <span className="resource-row-icon">
                                                    <Users size={18} />
                                                </span>
                                                <div className="resource-row-main">
                                                    <div className="resource-row-title">
                                                        <strong>{item.name}</strong>
                                                        <span className="badge">
                                                            {item.visibility === "PUBLIC" ? (
                                                                <Globe2 size={12} />
                                                            ) : (
                                                                <LockKeyhole size={12} />
                                                            )}
                                                            {item.visibility}
                                                        </span>
                                                        {item.my_role && (
                                                            <span className="badge badge-dark">
                                                                {item.my_role}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p>
                                                        {item.description ||
                                                            "Collaborative learning group."}
                                                    </p>
                                                    <div className="resource-row-meta">
                                                        <span>Code: {item.group_code}</span>
                                                        <span>{item.member_count} members</span>
                                                        {item.owner && (
                                                            <span>
                                                                Owner: {item.owner.display_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="resource-row-cta">
                                                    Open <ArrowRight size={14} />
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
                            <h3>No groups found</h3>
                            <p>Try another filter or create a new learning group.</p>
                        </div>
                    )}
                </section>
            )}

            {activeTab === "contests" && (
                <section className="discover-section" role="tabpanel">
                    <div className="discover-heading">
                        <div>
                            <p className="eyebrow">SCHEDULED EVENTS</p>
                            <h2>Contests</h2>
                            <p>
                                Public contests and competitions within the groups you belong to.
                            </p>
                        </div>
                    </div>
                    <div className="discover-controls">
                        <form className="home-search-field" onSubmit={submitContestSearch}>
                            <Search size={18} aria-hidden="true" />
                            <input
                                type="search"
                                aria-label="Search contests"
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
                        <div className="exam-filters">
                            {(["ALL", "ONGOING", "UPCOMING", "ENDED"] as const).map(
                                (phase): ReactNode => (
                                    <button
                                        key={phase}
                                        type="button"
                                        className={contestPhase === phase ? "selected" : ""}
                                        onClick={(): void => {
                                            setContestPhase(phase);
                                            setContestPage(1);
                                        }}
                                    >
                                        {phase === "ALL"
                                            ? "All"
                                            : phase === "ONGOING"
                                              ? "Ongoing"
                                              : phase === "UPCOMING"
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
                                                to={`/contests/${item.id}`}
                                            >
                                                <span className="resource-row-icon">
                                                    <GraduationCap size={18} />
                                                </span>
                                                <div className="resource-row-main">
                                                    <div className="resource-row-title">
                                                        <strong>{item.title}</strong>
                                                        <span className="badge">{item.phase}</span>
                                                        <span className="badge">
                                                            {item.visibility}
                                                        </span>
                                                    </div>
                                                    <p>
                                                        {item.description ||
                                                            "Scheduled assessment contest."}
                                                    </p>
                                                    <div className="resource-row-meta">
                                                        <span>
                                                            <CalendarDays size={13} />{" "}
                                                            {formatShortDate(item.start_time)} —{" "}
                                                            {formatShortDate(item.end_time)}
                                                        </span>
                                                        <span>
                                                            {item.submission_policy === "MULTIPLE"
                                                                ? "Multiple attempts"
                                                                : "Single attempt"}
                                                        </span>
                                                        {item.organizer && (
                                                            <span>
                                                                Host: {item.organizer.display_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="resource-row-cta">
                                                    View contest <ArrowRight size={14} />
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
                            <h3>No contests available</h3>
                            <p>Join a group or adjust your phase filter to view contests.</p>
                        </div>
                    )}
                </section>
            )}

            {activeTab === "practice" && (
                <section className="discover-section" role="tabpanel">
                    <div className="discover-heading">
                        <div>
                            <p className="eyebrow">GROUP PRACTICE</p>
                            <h2>Practice assessments</h2>
                            <p>
                                Only assessments explicitly enabled for self-paced practice inside
                                your joined groups appear here.
                            </p>
                        </div>
                    </div>
                    {joinedGroups.length === 0 ? (
                        <div className="empty dashboard-empty">
                            <Users size={23} />
                            <h3>Join a group to practice</h3>
                            <p>
                                Assessments belong to groups and contests. Join a group to unlock
                                any practice-enabled sets released by its managers.
                            </p>
                            <Link className="button primary" to="/groups">
                                Browse groups
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="discover-controls">
                                <label className="group-select-control">
                                    <span className="sr-only">Select group</span>
                                    <select
                                        value={practiceGroupId}
                                        onChange={(event): void => {
                                            setPracticeGroupId(event.target.value);
                                            setPracticePage(1);
                                        }}
                                    >
                                        {joinedGroups.map(
                                            (group: GroupSummary): ReactNode => (
                                                <option key={group.id} value={group.id}>
                                                    {group.name}
                                                </option>
                                            )
                                        )}
                                    </select>
                                </label>
                                <form className="home-search-field" onSubmit={submitPracticeSearch}>
                                    <Search size={18} aria-hidden="true" />
                                    <input
                                        type="search"
                                        aria-label="Search practice assessments"
                                        placeholder="Search practice assessments..."
                                        value={practiceSearchInput}
                                        onChange={(event): void => {
                                            const next: string = event.target.value;
                                            setPracticeSearchInput(next);
                                            if (next === "") {
                                                setPracticePage(1);
                                                setPracticeSearch("");
                                            }
                                        }}
                                    />
                                </form>
                            </div>
                            {loading && !practiceResult ? (
                                <p className="muted">Loading practice assessments...</p>
                            ) : practiceResult && practiceResult.items.length > 0 ? (
                                <>
                                    <ul className="resource-list">
                                        {practiceResult.items.map(
                                            (item: AssessmentMetadata): ReactNode => (
                                                <li key={item.id}>
                                                    <Link
                                                        className="resource-row"
                                                        to={`/assessments/${item.id}`}
                                                    >
                                                        <span className="resource-row-icon">
                                                            <BookOpen size={18} />
                                                        </span>
                                                        <div className="resource-row-main">
                                                            <div className="resource-row-title">
                                                                <strong>{item.title}</strong>
                                                                <span className="badge">
                                                                    {item.assessment_type}
                                                                </span>
                                                                <span className="badge badge-success">
                                                                    Practice enabled
                                                                </span>
                                                            </div>
                                                            <p>
                                                                {item.description ||
                                                                    "Open to review questions or start a practice attempt."}
                                                            </p>
                                                            <div className="resource-row-meta">
                                                                <span>
                                                                    {item.question_count} questions
                                                                </span>
                                                                <span>{item.total_points} pts</span>
                                                                <span>{item.content_format}</span>
                                                            </div>
                                                        </div>
                                                        <span className="resource-row-cta">
                                                            Practice <ArrowRight size={14} />
                                                        </span>
                                                    </Link>
                                                </li>
                                            )
                                        )}
                                    </ul>
                                    <Pagination
                                        pagination={practiceResult.pagination}
                                        onPageChange={setPracticePage}
                                        itemLabel="assessments"
                                    />
                                </>
                            ) : (
                                <div className="empty dashboard-empty">
                                    <BookOpen size={23} />
                                    <h3>No practice assessments in this group</h3>
                                    <p>
                                        Group managers keep contest assessments closed unless
                                        practice mode is enabled.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}
        </div>
    );
}
