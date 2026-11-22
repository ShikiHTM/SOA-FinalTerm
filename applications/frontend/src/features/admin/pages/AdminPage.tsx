import {
    BookOpen,
    GraduationCap,
    Search,
    ShieldAlert,
    ShieldCheck,
    Trash2,
    Users
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../../api/client";
import type {
    AdminAssessmentRecord,
    AdminContestRecord,
    AdminGroupRecord,
    AdminUserRecord,
    ContestStatus,
    GroupStatus,
    PaginatedResult,
    PaginationMeta,
    UserStatus,
    UserSystemRole
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { PageTitle, formatDate, useApp } from "../../../shared/context";

const PAGE_LIMIT: number = 10;

type AdminTab = "users" | "groups" | "assessments" | "contests";

type PendingModeration =
    | {
          kind: "user_status";
          id: string;
          label: string;
          nextStatus: UserStatus;
          requireReason: boolean;
      }
    | {
          kind: "group_status";
          id: string;
          label: string;
          nextStatus: GroupStatus;
          requireReason: boolean;
      }
    | {
          kind: "group_delete";
          id: string;
          label: string;
          requireReason: boolean;
      }
    | {
          kind: "assessment_status";
          id: string;
          label: string;
          nextStatus: "ACTIVE" | "HIDDEN";
          requireReason: boolean;
      }
    | {
          kind: "assessment_delete";
          id: string;
          label: string;
          requireReason: boolean;
      }
    | {
          kind: "contest_status";
          id: string;
          label: string;
          nextStatus: ContestStatus;
          requireReason: boolean;
      }
    | {
          kind: "contest_delete";
          id: string;
          label: string;
          requireReason: boolean;
      };

const EMPTY_PAGINATION: PaginationMeta = {
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    total_pages: 1
};

export function AdminPage(): ReactNode {
    const { user } = useApp();
    const [activeTab, setActiveTab]: [AdminTab, Dispatch<SetStateAction<AdminTab>>] =
        useState<AdminTab>("users");
    const [searchInput, setSearchInput]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [searchQuery, setSearchQuery]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [page, setPage]: [number, Dispatch<SetStateAction<number>>] = useState<number>(1);

    const [users, setUsers]: [AdminUserRecord[], Dispatch<SetStateAction<AdminUserRecord[]>>] =
        useState<AdminUserRecord[]>([]);
    const [groups, setGroups]: [AdminGroupRecord[], Dispatch<SetStateAction<AdminGroupRecord[]>>] =
        useState<AdminGroupRecord[]>([]);
    const [assessments, setAssessments]: [
        AdminAssessmentRecord[],
        Dispatch<SetStateAction<AdminAssessmentRecord[]>>
    ] = useState<AdminAssessmentRecord[]>([]);
    const [contests, setContests]: [
        AdminContestRecord[],
        Dispatch<SetStateAction<AdminContestRecord[]>>
    ] = useState<AdminContestRecord[]>([]);

    const [pagination, setPagination]: [PaginationMeta, Dispatch<SetStateAction<PaginationMeta>>] =
        useState<PaginationMeta>(EMPTY_PAGINATION);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [notice, setNotice]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const [pendingAction, setPendingAction]: [
        PendingModeration | null,
        Dispatch<SetStateAction<PendingModeration | null>>
    ] = useState<PendingModeration | null>(null);
    const [reasonText, setReasonText]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [submitting, setSubmitting]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);

    const loadTabData: () => Promise<void> = useCallback(async (): Promise<void> => {
        if (user.system_role !== "ADMIN") {
            return;
        }
        setLoading(true);
        setError("");
        const normalizedSearch: string | undefined = searchQuery.trim() || undefined;
        try {
            if (activeTab === "users") {
                const res: PaginatedResult<AdminUserRecord> = await adminApi.listUsers({
                    page,
                    limit: PAGE_LIMIT,
                    search: normalizedSearch
                });
                setUsers(res.items);
                setPagination(res.pagination);
            } else if (activeTab === "groups") {
                const res: PaginatedResult<AdminGroupRecord> = await adminApi.listGroups({
                    page,
                    limit: PAGE_LIMIT,
                    search: normalizedSearch
                });
                setGroups(res.items);
                setPagination(res.pagination);
            } else if (activeTab === "assessments") {
                const res: PaginatedResult<AdminAssessmentRecord> = await adminApi.listAssessments({
                    page,
                    limit: PAGE_LIMIT,
                    search: normalizedSearch
                });
                setAssessments(res.items);
                setPagination(res.pagination);
            } else {
                const res: PaginatedResult<AdminContestRecord> = await adminApi.listContests({
                    page,
                    limit: PAGE_LIMIT,
                    search: normalizedSearch
                });
                setContests(res.items);
                setPagination(res.pagination);
            }
        } catch (err: unknown) {
            setError(extractErrorMessage(err, "Unable to load moderation records."));
        } finally {
            setLoading(false);
        }
    }, [activeTab, page, searchQuery, user.system_role]);

    useEffect((): void => {
        void loadTabData();
    }, [loadTabData]);

    function switchTab(nextTab: AdminTab): void {
        setActiveTab(nextTab);
        setPage(1);
        setSearchInput("");
        setSearchQuery("");
        setPendingAction(null);
        setReasonText("");
        setError("");
        setNotice("");
    }

    function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        setPage(1);
        setSearchQuery(searchInput);
    }

    async function handleToggleRole(record: AdminUserRecord): Promise<void> {
        const nextRole: UserSystemRole = record.system_role === "ADMIN" ? "USER" : "ADMIN";
        setError("");
        setNotice("");
        setSubmitting(true);
        try {
            await adminApi.updateUserRole(record.id, nextRole);
            setNotice(`Updated ${record.display_name}'s system role to ${nextRole}.`);
            await loadTabData();
        } catch (err: unknown) {
            setError(extractErrorMessage(err, "Unable to update system role."));
        } finally {
            setSubmitting(false);
        }
    }

    async function handleConfirmModeration(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (!pendingAction) {
            return;
        }
        const trimmedReason: string = reasonText.trim();
        if (pendingAction.requireReason && !trimmedReason) {
            setError("Please enter a moderation reason before confirming.");
            return;
        }

        setSubmitting(true);
        setError("");
        setNotice("");

        try {
            if (pendingAction.kind === "user_status") {
                await adminApi.updateUserStatus(
                    pendingAction.id,
                    pendingAction.nextStatus,
                    trimmedReason || undefined
                );
            } else if (pendingAction.kind === "group_status") {
                await adminApi.updateGroupStatus(
                    pendingAction.id,
                    pendingAction.nextStatus,
                    trimmedReason || undefined
                );
            } else if (pendingAction.kind === "group_delete") {
                await adminApi.deleteGroup(pendingAction.id, trimmedReason || undefined);
            } else if (pendingAction.kind === "assessment_status") {
                await adminApi.updateAssessmentStatus(
                    pendingAction.id,
                    pendingAction.nextStatus,
                    trimmedReason || undefined
                );
            } else if (pendingAction.kind === "assessment_delete") {
                await adminApi.deleteAssessment(pendingAction.id, trimmedReason || undefined);
            } else if (pendingAction.kind === "contest_status") {
                await adminApi.updateContestStatus(
                    pendingAction.id,
                    pendingAction.nextStatus,
                    trimmedReason || undefined
                );
            } else if (pendingAction.kind === "contest_delete") {
                await adminApi.deleteContest(pendingAction.id, trimmedReason || undefined);
            }

            setNotice(`Completed action: ${pendingAction.label}.`);
            setPendingAction(null);
            setReasonText("");
            await loadTabData();
        } catch (err: unknown) {
            setError(extractErrorMessage(err, "Unable to apply moderation action."));
        } finally {
            setSubmitting(false);
        }
    }

    if (user.system_role !== "ADMIN") {
        return (
            <section className="panel restricted-banner page-enter" role="alert">
                <ShieldAlert size={20} />
                <div>
                    <h1>Administrator access required</h1>
                    <p className="muted">
                        This moderation console is restricted to system administrators.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <div className="page-enter">
            <PageTitle
                label="Administration"
                title="System moderation console"
                description="Manage platform accounts, study groups, assessments, and scheduled contests."
            />

            <div className="tabs" role="tablist" aria-label="Moderation categories">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "users"}
                    className={activeTab === "users" ? "tab active" : "tab"}
                    onClick={(): void => switchTab("users")}
                >
                    <ShieldCheck size={15} /> Users
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "groups"}
                    className={activeTab === "groups" ? "tab active" : "tab"}
                    onClick={(): void => switchTab("groups")}
                >
                    <Users size={15} /> Groups
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "assessments"}
                    className={activeTab === "assessments" ? "tab active" : "tab"}
                    onClick={(): void => switchTab("assessments")}
                >
                    <BookOpen size={15} /> Assessments
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "contests"}
                    className={activeTab === "contests" ? "tab active" : "tab"}
                    onClick={(): void => switchTab("contests")}
                >
                    <GraduationCap size={15} /> Contests
                </button>
            </div>

            {pendingAction && (
                <form className="panel form" onSubmit={handleConfirmModeration}>
                    <div className="panel-head">
                        <div>
                            <p className="eyebrow">Confirm moderation action</p>
                            <h2>{pendingAction.label}</h2>
                        </div>
                        <button
                            type="button"
                            className="button button-small"
                            onClick={(): void => {
                                setPendingAction(null);
                                setReasonText("");
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                    <label className="field">
                        <span>
                            Reason {pendingAction.requireReason ? "(required)" : "(optional)"}
                        </span>
                        <input
                            type="text"
                            value={reasonText}
                            required={pendingAction.requireReason}
                            placeholder="Document the policy reason for audit logs..."
                            onChange={(e): void => setReasonText(e.target.value)}
                        />
                    </label>
                    <div className="action-row">
                        <button className="button primary" type="submit" disabled={submitting}>
                            {submitting ? "Applying..." : "Confirm action"}
                        </button>
                    </div>
                </form>
            )}

            <section className="panel">
                <form className="discover-controls" onSubmit={handleSearchSubmit}>
                    <label className="home-search-field">
                        <Search size={16} />
                        <span className="sr-only">Search {activeTab}</span>
                        <input
                            type="search"
                            value={searchInput}
                            placeholder={`Search ${activeTab}...`}
                            onChange={(e): void => setSearchInput(e.target.value)}
                        />
                    </label>
                    <div className="action-row">
                        <button className="button" type="submit">
                            Search
                        </button>
                        {searchQuery && (
                            <button
                                className="button button-small"
                                type="button"
                                onClick={(): void => {
                                    setSearchInput("");
                                    setSearchQuery("");
                                    setPage(1);
                                }}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </form>

                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                {notice && (
                    <p className="notice" role="status">
                        {notice}
                    </p>
                )}

                {loading ? (
                    <div className="skeleton-stack" aria-busy="true">
                        <div className="skeleton-block" />
                        <div className="skeleton-block" />
                        <div className="skeleton-block" />
                    </div>
                ) : activeTab === "users" ? (
                    users.length === 0 ? (
                        <p className="empty">No user accounts matched your search.</p>
                    ) : (
                        <div className="resource-list">
                            {users.map((record: AdminUserRecord): ReactNode => {
                                const isSelf: boolean = record.id === user.id;
                                return (
                                    <article key={record.id} className="resource-row">
                                        <div className="resource-row-main">
                                            <div className="resource-row-badges">
                                                <span className="badge">{record.system_role}</span>
                                                <span className="badge">{record.status}</span>
                                                {isSelf && <span className="badge">You</span>}
                                            </div>
                                            <h2 className="resource-row-title">
                                                <Link
                                                    className="link"
                                                    to={`/users/${encodeURIComponent(record.username)}`}
                                                >
                                                    {record.display_name} (@{record.username})
                                                </Link>
                                            </h2>
                                            <div className="resource-row-meta">
                                                <span>{record.email}</span>
                                                <span>Joined {formatDate(record.created_at)}</span>
                                                {record.moderation_reason && (
                                                    <span>Reason: {record.moderation_reason}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="resource-row-actions">
                                            {!isSelf && (
                                                <button
                                                    type="button"
                                                    className="button button-small"
                                                    disabled={submitting}
                                                    onClick={(): void => {
                                                        void handleToggleRole(record);
                                                    }}
                                                >
                                                    {record.system_role === "ADMIN"
                                                        ? "Demote to user"
                                                        : "Promote to admin"}
                                                </button>
                                            )}
                                            {!isSelf && record.status !== "ACTIVE" && (
                                                <button
                                                    type="button"
                                                    className="button button-small"
                                                    onClick={(): void => {
                                                        setReasonText("");
                                                        setPendingAction({
                                                            kind: "user_status",
                                                            id: record.id,
                                                            label: `Restore ${record.username} to ACTIVE`,
                                                            nextStatus: "ACTIVE",
                                                            requireReason: false
                                                        });
                                                    }}
                                                >
                                                    Restore
                                                </button>
                                            )}
                                            {!isSelf && record.status === "ACTIVE" && (
                                                <button
                                                    type="button"
                                                    className="button button-small"
                                                    onClick={(): void => {
                                                        setReasonText("");
                                                        setPendingAction({
                                                            kind: "user_status",
                                                            id: record.id,
                                                            label: `Suspend ${record.username}`,
                                                            nextStatus: "SUSPENDED",
                                                            requireReason: true
                                                        });
                                                    }}
                                                >
                                                    Suspend
                                                </button>
                                            )}
                                            {!isSelf && record.status !== "BANNED" && (
                                                <button
                                                    type="button"
                                                    className="button button-small"
                                                    onClick={(): void => {
                                                        setReasonText("");
                                                        setPendingAction({
                                                            kind: "user_status",
                                                            id: record.id,
                                                            label: `Ban ${record.username}`,
                                                            nextStatus: "BANNED",
                                                            requireReason: true
                                                        });
                                                    }}
                                                >
                                                    Ban
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )
                ) : activeTab === "groups" ? (
                    groups.length === 0 ? (
                        <p className="empty">No groups matched your search.</p>
                    ) : (
                        <div className="resource-list">
                            {groups.map((record: AdminGroupRecord): ReactNode => (
                                <article key={record.id} className="resource-row">
                                    <div className="resource-row-main">
                                        <div className="resource-row-badges">
                                            <span className="badge">{record.visibility}</span>
                                            <span className="badge">{record.status}</span>
                                            <span className="badge">{record.join_policy}</span>
                                        </div>
                                        <h2 className="resource-row-title">
                                            <Link className="link" to={`/groups/${record.id}`}>
                                                {record.name}
                                            </Link>
                                        </h2>
                                        <div className="resource-row-meta">
                                            <span>Code: {record.group_code}</span>
                                            <span>{record.member_count} members</span>
                                            {record.moderation_reason && (
                                                <span>Reason: {record.moderation_reason}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="resource-row-actions">
                                        {record.status === "ACTIVE" ? (
                                            <button
                                                type="button"
                                                className="button button-small"
                                                onClick={(): void => {
                                                    setReasonText("");
                                                    setPendingAction({
                                                        kind: "group_status",
                                                        id: record.id,
                                                        label: `Suspend group "${record.name}"`,
                                                        nextStatus: "SUSPENDED",
                                                        requireReason: true
                                                    });
                                                }}
                                            >
                                                Suspend
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="button button-small"
                                                onClick={(): void => {
                                                    setReasonText("");
                                                    setPendingAction({
                                                        kind: "group_status",
                                                        id: record.id,
                                                        label: `Restore group "${record.name}"`,
                                                        nextStatus: "ACTIVE",
                                                        requireReason: false
                                                    });
                                                }}
                                            >
                                                Restore
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="button button-small"
                                            onClick={(): void => {
                                                setReasonText("");
                                                setPendingAction({
                                                    kind: "group_delete",
                                                    id: record.id,
                                                    label: `Delete group "${record.name}"`,
                                                    requireReason: false
                                                });
                                            }}
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )
                ) : activeTab === "assessments" ? (
                    assessments.length === 0 ? (
                        <p className="empty">No assessments matched your search.</p>
                    ) : (
                        <div className="resource-list">
                            {assessments.map((record: AdminAssessmentRecord): ReactNode => (
                                <article key={record.id} className="resource-row">
                                    <div className="resource-row-main">
                                        <div className="resource-row-badges">
                                            <span className="badge">{record.status}</span>
                                            <span className="badge">{record.assessment_type}</span>
                                            <span className="badge">
                                                {record.is_practice_enabled
                                                    ? "Practice enabled"
                                                    : "Contest only"}
                                            </span>
                                        </div>
                                        <h2 className="resource-row-title">
                                            <Link className="link" to={`/assessments/${record.id}`}>
                                                {record.title}
                                            </Link>
                                        </h2>
                                        <div className="resource-row-meta">
                                            <span>{record.question_count} questions</span>
                                            <span>{record.total_points} pts</span>
                                            {record.group && <span>Group: {record.group.name}</span>}
                                            {record.moderation_reason && (
                                                <span>Reason: {record.moderation_reason}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="resource-row-actions">
                                        {record.status === "ACTIVE" ? (
                                            <button
                                                type="button"
                                                className="button button-small"
                                                onClick={(): void => {
                                                    setReasonText("");
                                                    setPendingAction({
                                                        kind: "assessment_status",
                                                        id: record.id,
                                                        label: `Hide assessment "${record.title}"`,
                                                        nextStatus: "HIDDEN",
                                                        requireReason: true
                                                    });
                                                }}
                                            >
                                                Hide
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="button button-small"
                                                onClick={(): void => {
                                                    setReasonText("");
                                                    setPendingAction({
                                                        kind: "assessment_status",
                                                        id: record.id,
                                                        label: `Restore assessment "${record.title}"`,
                                                        nextStatus: "ACTIVE",
                                                        requireReason: false
                                                    });
                                                }}
                                            >
                                                Restore
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="button button-small"
                                            onClick={(): void => {
                                                setReasonText("");
                                                setPendingAction({
                                                    kind: "assessment_delete",
                                                    id: record.id,
                                                    label: `Delete assessment "${record.title}"`,
                                                    requireReason: false
                                                });
                                            }}
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )
                ) : contests.length === 0 ? (
                    <p className="empty">No contests matched your search.</p>
                ) : (
                    <div className="resource-list">
                        {contests.map((record: AdminContestRecord): ReactNode => (
                            <article key={record.id} className="resource-row">
                                <div className="resource-row-main">
                                    <div className="resource-row-badges">
                                        <span className="badge">{record.status}</span>
                                        <span className="badge">{record.phase}</span>
                                        <span className="badge">{record.visibility}</span>
                                    </div>
                                    <h2 className="resource-row-title">
                                        <Link className="link" to={`/contests/${record.id}`}>
                                            {record.title}
                                        </Link>
                                    </h2>
                                    <div className="resource-row-meta">
                                        {record.group && <span>Group: {record.group.name}</span>}
                                        <span>Starts {formatDate(record.start_time)}</span>
                                        <span>Ends {formatDate(record.end_time)}</span>
                                        {record.moderation_reason && (
                                            <span>Reason: {record.moderation_reason}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="resource-row-actions">
                                    {record.status !== "CANCELLED" ? (
                                        <button
                                            type="button"
                                            className="button button-small"
                                            onClick={(): void => {
                                                setReasonText("");
                                                setPendingAction({
                                                    kind: "contest_status",
                                                    id: record.id,
                                                    label: `Cancel contest "${record.title}"`,
                                                    nextStatus: "CANCELLED",
                                                    requireReason: true
                                                });
                                            }}
                                        >
                                            Cancel contest
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="button button-small"
                                            onClick={(): void => {
                                                setReasonText("");
                                                setPendingAction({
                                                    kind: "contest_status",
                                                    id: record.id,
                                                    label: `Publish contest "${record.title}"`,
                                                    nextStatus: "PUBLISHED",
                                                    requireReason: false
                                                });
                                            }}
                                        >
                                            Republish
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="button button-small"
                                        onClick={(): void => {
                                            setReasonText("");
                                            setPendingAction({
                                                kind: "contest_delete",
                                                id: record.id,
                                                label: `Delete contest "${record.title}"`,
                                                requireReason: false
                                            });
                                        }}
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                {!loading && (
                    <Pagination
                        pagination={pagination}
                        onPageChange={setPage}
                        itemLabel={activeTab}
                    />
                )}
            </section>
        </div>
    );
}
