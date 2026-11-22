import { Plus, Search, Users } from "lucide-react";
import {
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link } from "react-router-dom";
import { groupsApi } from "../../../api/client";
import type { GroupSummary, GroupVisibility, PaginatedResult } from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { PageTitle } from "../../../shared/context";
import { GroupCard } from "../components/GroupCard";

const PAGE_LIMIT: number = 8;

export function Groups(): ReactNode {
    const [section, setSection]: ["discover" | "mine", Dispatch<SetStateAction<"discover" | "mine">>] =
        useState<"discover" | "mine">("discover");
    const [visibility, setVisibility]: [
        GroupVisibility | "ALL",
        Dispatch<SetStateAction<GroupVisibility | "ALL">>
    ] = useState<GroupVisibility | "ALL">("ALL");
    const [searchInput, setSearchInput]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [search, setSearch]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [page, setPage]: [number, Dispatch<SetStateAction<number>>] = useState<number>(1);
    const [result, setResult]: [
        PaginatedResult<GroupSummary> | null,
        Dispatch<SetStateAction<PaginatedResult<GroupSummary> | null>>
    ] = useState<PaginatedResult<GroupSummary> | null>(null);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        setLoading(true);
        setError("");
        const request: Promise<PaginatedResult<GroupSummary>> =
            section === "mine"
                ? groupsApi.listMine({ page, limit: PAGE_LIMIT })
                : groupsApi.list({
                      page,
                      limit: PAGE_LIMIT,
                      search: search || undefined,
                      visibility: visibility === "ALL" ? undefined : visibility
                  });
        void request
            .then((res): void => setResult(res))
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load groups."));
            })
            .finally((): void => setLoading(false));
    }, [page, search, section, visibility]);

    function handleSearchSubmit(event: FormEvent): void {
        event.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
    }

    return (
        <div className="page-enter">
            <PageTitle
                label="COMMUNITIES"
                title="Learning groups"
                description="Find learning groups by name or invitation code, or manage groups you joined."
                action={
                    <Link className="button primary" to="/groups/new">
                        <Plus size={16} /> Create group
                    </Link>
                }
            />
            <div className="toolbar groups-toolbar">
                <div className="tabs" aria-label="Group view">
                    <button
                        type="button"
                        className={section === "discover" ? "active" : ""}
                        aria-pressed={section === "discover"}
                        onClick={(): void => {
                            setSection("discover");
                            setPage(1);
                        }}
                    >
                        Discover
                    </button>
                    <button
                        type="button"
                        className={section === "mine" ? "active" : ""}
                        aria-pressed={section === "mine"}
                        onClick={(): void => {
                            setSection("mine");
                            setPage(1);
                        }}
                    >
                        My groups
                    </button>
                </div>
                <form className="home-search-field groups-search" onSubmit={handleSearchSubmit}>
                    <Search size={17} aria-hidden="true" />
                    <input
                        type="search"
                        disabled={section === "mine"}
                        aria-label="Search by group name or code"
                        placeholder={
                            section === "mine"
                                ? "Showing your joined groups"
                                : "Search by group name or invitation code..."
                        }
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
                {section === "discover" && (
                    <div className="exam-filters" aria-label="Visibility filter">
                        {(["ALL", "PUBLIC", "PRIVATE"] as const).map(
                            (value): ReactNode => (
                                <button
                                    key={value}
                                    type="button"
                                    className={visibility === value ? "selected" : ""}
                                    onClick={(): void => {
                                        setVisibility(value);
                                        setPage(1);
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
                )}
            </div>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {loading && !result ? (
                <p className="muted">Loading groups...</p>
            ) : result && result.items.length > 0 ? (
                <>
                    <ul className="resource-list">
                        {result.items.map(
                            (group: GroupSummary): ReactNode => (
                                <li key={group.id}>
                                    <GroupCard group={group} />
                                </li>
                            )
                        )}
                    </ul>
                    <Pagination
                        pagination={result.pagination}
                        onPageChange={setPage}
                        itemLabel="groups"
                    />
                </>
            ) : (
                <div className="empty dashboard-empty">
                    <Users size={23} />
                    <h3>
                        {search
                            ? "No matching groups found"
                            : section === "mine"
                              ? "You have not joined any groups yet"
                              : "No groups available"}
                    </h3>
                    <p>
                        {section === "mine"
                            ? "Join an existing group from Discover or create a new one."
                            : "Try clearing your search filter or create a new group."}
                    </p>
                </div>
            )}
        </div>
    );
}
