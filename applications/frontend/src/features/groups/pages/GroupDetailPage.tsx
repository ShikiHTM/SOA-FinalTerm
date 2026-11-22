import {
    BookOpen,
    CalendarDays,
    ClipboardCheck,
    FilePlus2,
    Globe2,
    Inbox,
    LockKeyhole,
    Settings,
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
import { Link, useParams } from "react-router-dom";
import { assessmentsApi, contestsApi, groupsApi } from "../../../api/client";
import type {
    AssessmentMetadata,
    ContestSummary,
    GroupMemberRecord,
    GroupRole,
    GroupSummary,
    JoinRequestRecord
} from "../../../api/types";
import { hasGroupPermission } from "../../../authorization/permissions";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { canManage, formatDate, groupRoleOf, hasAccess, useApp } from "../../../shared/context";

export function GroupDetail(): ReactNode {
    const { groupId }: { groupId?: string } = useParams();
    const { user }: ReturnType<typeof useApp> = useApp();

    const [group, setGroup]: [GroupSummary | null, Dispatch<SetStateAction<GroupSummary | null>>] =
        useState<GroupSummary | null>(null);
    const [contests, setContests]: [ContestSummary[], Dispatch<SetStateAction<ContestSummary[]>>] =
        useState<ContestSummary[]>([]);
    const [assessments, setAssessments]: [
        AssessmentMetadata[],
        Dispatch<SetStateAction<AssessmentMetadata[]>>
    ] = useState<AssessmentMetadata[]>([]);
    const [members, setMembers]: [
        GroupMemberRecord[],
        Dispatch<SetStateAction<GroupMemberRecord[]>>
    ] = useState<GroupMemberRecord[]>([]);
    const [requests, setRequests]: [
        JoinRequestRecord[],
        Dispatch<SetStateAction<JoinRequestRecord[]>>
    ] = useState<JoinRequestRecord[]>([]);

    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [pendingRequested, setPendingRequested]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [busyUser, setBusyUser]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [leaving, setLeaving]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [joining, setJoining]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const loadGroupData: () => Promise<void> = useCallback(async (): Promise<void> => {
        if (!groupId) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            const loadedGroup: GroupSummary = await groupsApi.getById(groupId);
            setGroup(loadedGroup);
            const role: GroupRole = groupRoleOf(loadedGroup);
            const canView: boolean = hasAccess(loadedGroup);
            const isManager: boolean = canManage(loadedGroup, user.system_role);

            if (canView) {
                const [contestRes, assessmentRes, membersRes] = await Promise.all([
                    contestsApi.list({ group_id: loadedGroup.id, page: 1, limit: 20 }),
                    assessmentsApi.listByGroup({
                        group_id: loadedGroup.id,
                        page: 1,
                        limit: 20,
                        is_practice_enabled: isManager ? undefined : true
                    }),
                    groupsApi.listMembers(loadedGroup.id, { page: 1, limit: 25 })
                ]);
                setContests(contestRes.items);
                setAssessments(assessmentRes.items);
                setMembers(membersRes.items);
            } else {
                setContests([]);
                setAssessments([]);
                setMembers([]);
            }

            if (hasGroupPermission(role, "MANAGE_MEMBERS") && loadedGroup.join_policy === "APPROVAL") {
                const reqRes = await groupsApi.listRequests(loadedGroup.id, {
                    status: "PENDING",
                    page: 1,
                    limit: 25
                });
                setRequests(reqRes.items);
            } else {
                setRequests([]);
            }
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load group details."));
        } finally {
            setLoading(false);
        }
    }, [groupId, user.system_role]);

    useEffect((): void => {
        void loadGroupData();
    }, [loadGroupData]);

    async function handleJoin(): Promise<void> {
        if (!group) {
            return;
        }
        setJoining(true);
        setError("");
        try {
            if (group.join_policy === "APPROVAL") {
                await groupsApi.requestJoin(group.id);
                setPendingRequested(true);
            } else {
                await groupsApi.join(
                    group.id,
                    group.join_policy === "PASSWORD" ? password : undefined
                );
                setPassword("");
            }
            await loadGroupData();
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to join group."));
        } finally {
            setJoining(false);
        }
    }

    async function handleLeave(): Promise<void> {
        if (!group || !window.confirm(`Leave group "${group.name}"?`)) {
            return;
        }
        setLeaving(true);
        setError("");
        try {
            await groupsApi.leave(group.id);
            await loadGroupData();
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to leave group."));
        } finally {
            setLeaving(false);
        }
    }

    async function handleReviewRequest(
        requestId: string,
        decision: "APPROVED" | "REJECTED"
    ): Promise<void> {
        if (!group) {
            return;
        }
        setBusyUser(requestId);
        setError("");
        try {
            await groupsApi.reviewRequest(group.id, requestId, decision);
            await loadGroupData();
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to review join request."));
        } finally {
            setBusyUser("");
        }
    }

    if (loading && !group) {
        return <p className="muted">Loading group...</p>;
    }
    if (!group) {
        return (
            <div className="page-enter">
                <Link className="group-breadcrumb" to="/groups">
                    Groups <span>/</span> Not found
                </Link>
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <p className="empty">Group not found.</p>
            </div>
        );
    }

    const role: GroupRole = groupRoleOf(group);
    const accessible: boolean = hasAccess(group);
    const managerView: boolean = canManage(group, user.system_role);

    return (
        <div className="group-detail-page page-enter">
            <Link className="group-breadcrumb" to="/groups">
                Groups <span>/</span> Group Details
            </Link>
            <header className="group-hero">
                <div className="group-hero-icon">
                    <Users size={27} strokeWidth={1.7} />
                </div>
                <div className="group-hero-content">
                    <div className="group-hero-label">
                        <span>LEARNING GROUP</span>
                        <span className="group-visibility">
                            {group.visibility === "PRIVATE" ? (
                                <LockKeyhole size={13} />
                            ) : (
                                <Globe2 size={13} />
                            )}
                            {group.visibility}
                        </span>
                    </div>
                    <h1>{group.name}</h1>
                    <p>{group.description || "No description provided for this group."}</p>
                </div>
                <div className="group-hero-code">
                    <span>GROUP CODE</span>
                    <strong>{group.group_code}</strong>
                </div>
            </header>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            <div className="group-workspace">
                <div className="group-content">
                    {managerView && (
                        <section className="group-section group-management">
                            <div className="group-section-heading">
                                <div>
                                    <p className="group-section-kicker">GROUP ADMINISTRATION</p>
                                    <h2>Manage group</h2>
                                    <p>
                                        Create assessments, schedule contests, grade essays, and
                                        manage members.
                                    </p>
                                </div>
                            </div>
                            <div className="group-quick-actions">
                                <Link
                                    className="group-action"
                                    to={`/assessments/new?group=${group.id}`}
                                >
                                    <span className="group-action-icon">
                                        <FilePlus2 size={19} />
                                    </span>
                                    <span>
                                        <strong>Create assessment</strong>
                                        <small>JSON or PDF upload</small>
                                    </span>
                                </Link>
                                <Link
                                    className="group-action"
                                    to={`/contests/new?group=${group.id}`}
                                >
                                    <span className="group-action-icon">
                                        <CalendarDays size={19} />
                                    </span>
                                    <span>
                                        <strong>Create contest</strong>
                                        <small>Schedule competition</small>
                                    </span>
                                </Link>
                                <Link className="group-action" to={`/groups/${group.id}/grading`}>
                                    <span className="group-action-icon">
                                        <ClipboardCheck size={19} />
                                    </span>
                                    <span>
                                        <strong>Grade submissions</strong>
                                        <small>Review &amp; score essays</small>
                                    </span>
                                </Link>
                                {hasGroupPermission(role, "MANAGE_MEMBERS") && (
                                    <Link
                                        className="group-action"
                                        to={`/groups/${group.id}/settings`}
                                    >
                                        <span className="group-action-icon">
                                            <Settings size={19} />
                                        </span>
                                        <span>
                                            <strong>
                                                {hasGroupPermission(role, "MANAGE_SETTINGS")
                                                    ? "Group settings"
                                                    : "Member management"}
                                            </strong>
                                            <small>Roles, members &amp; bans</small>
                                        </span>
                                    </Link>
                                )}
                            </div>
                        </section>
                    )}

                    <section className="group-section">
                        <div className="group-section-heading">
                            <div>
                                <p className="group-section-kicker">COMPETITIONS</p>
                                <h2>Group contests</h2>
                                <p>Scheduled contests hosted inside this group.</p>
                            </div>
                            {accessible && (
                                <span className="group-section-count">
                                    {contests.length} contests
                                </span>
                            )}
                        </div>
                        {accessible ? (
                            contests.length > 0 ? (
                                <div className="group-resource-list">
                                    {contests.map(
                                        (contest: ContestSummary): ReactNode => (
                                            <Link
                                                className="group-resource"
                                                key={contest.id}
                                                to={`/contests/${contest.id}`}
                                            >
                                                <span className="group-resource-icon">
                                                    <CalendarDays size={19} />
                                                </span>
                                                <span className="group-resource-copy">
                                                    <strong>{contest.title}</strong>
                                                    <small>
                                                        {contest.phase} · Ends{" "}
                                                        {formatDate(contest.end_time)}
                                                    </small>
                                                </span>
                                                <span className="group-resource-link">
                                                    View contest
                                                </span>
                                            </Link>
                                        )
                                    )}
                                </div>
                            ) : (
                                <div className="group-empty">
                                    <span>
                                        <CalendarDays size={19} />
                                    </span>
                                    <div>
                                        <strong>No contests yet</strong>
                                        <p>Contests created in this group will appear here.</p>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="group-empty">
                                <span>
                                    <LockKeyhole size={19} />
                                </span>
                                <div>
                                    <strong>Members only</strong>
                                    <p>Join this group to view its contests.</p>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="group-section">
                        <div className="group-section-heading">
                            <div>
                                <p className="group-section-kicker">ASSESSMENTS</p>
                                <h2>
                                    {managerView ? "Group assessment bank" : "Practice assessments"}
                                </h2>
                                <p>
                                    {managerView
                                        ? "All assessments authored in this group for contests or practice."
                                        : "Only assessments enabled for practice are shown outside active contests."}
                                </p>
                            </div>
                            {accessible && (
                                <span className="group-section-count">
                                    {assessments.length} assessments
                                </span>
                            )}
                        </div>
                        {accessible ? (
                            assessments.length > 0 ? (
                                <div className="group-resource-list">
                                    {assessments.map(
                                        (exam: AssessmentMetadata): ReactNode => (
                                            <Link
                                                className="group-resource"
                                                key={exam.id}
                                                to={`/assessments/${exam.id}`}
                                            >
                                                <span className="group-resource-icon">
                                                    <BookOpen size={19} />
                                                </span>
                                                <span className="group-resource-copy">
                                                    <strong>{exam.title}</strong>
                                                    <small>
                                                        {exam.question_count} questions ·{" "}
                                                        {exam.total_points} pts ·{" "}
                                                        {exam.content_format}
                                                        {exam.is_practice_enabled
                                                            ? " · Practice enabled"
                                                            : " · Contest only"}
                                                    </small>
                                                </span>
                                                <span className="group-resource-link">
                                                    View assessment
                                                </span>
                                            </Link>
                                        )
                                    )}
                                </div>
                            ) : (
                                <div className="group-empty">
                                    <span>
                                        <BookOpen size={19} />
                                    </span>
                                    <div>
                                        <strong>
                                            {managerView
                                                ? "No assessments created"
                                                : "No practice assessments enabled"}
                                        </strong>
                                        <p>
                                            {managerView
                                                ? "Create an assessment to link it with a contest or enable practice mode."
                                                : "Non-practice assessments can only be taken during scheduled contests."}
                                        </p>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="group-empty">
                                <span>
                                    <LockKeyhole size={19} />
                                </span>
                                <div>
                                    <strong>Members only</strong>
                                    <p>Join this group to access practice assessments.</p>
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <aside className="group-side">
                    <section className="group-section group-information">
                        <div className="group-section-heading">
                            <div>
                                <p className="group-section-kicker">OVERVIEW</p>
                                <h2>Group info</h2>
                            </div>
                        </div>
                        <dl className="group-info-list">
                            <div>
                                <dt>Group code</dt>
                                <dd>{group.group_code}</dd>
                            </div>
                            <div>
                                <dt>Visibility</dt>
                                <dd>{group.visibility}</dd>
                            </div>
                            <div>
                                <dt>Join policy</dt>
                                <dd>{group.join_policy}</dd>
                            </div>
                            <div>
                                <dt>Your role</dt>
                                <dd>
                                    {role === "OWNER"
                                        ? "Owner"
                                        : role === "MODERATOR"
                                          ? "Moderator"
                                          : role === "MEMBER"
                                            ? "Member"
                                            : pendingRequested
                                              ? "Pending approval"
                                              : "Not a member"}
                                </dd>
                            </div>
                        </dl>
                        {(role === "MEMBER" || role === "MODERATOR") && (
                            <div className="group-membership-action">
                                <button
                                    className="button group-leave-button"
                                    type="button"
                                    disabled={leaving}
                                    onClick={(): void => {
                                        void handleLeave();
                                    }}
                                >
                                    {leaving ? "Leaving..." : "Leave group"}
                                </button>
                            </div>
                        )}
                        {role === "VISITOR" && !pendingRequested && (
                            <div className="group-membership-action form">
                                {group.join_policy === "PASSWORD" && (
                                    <label>
                                        Group password
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(event): void =>
                                                setPassword(event.target.value)
                                            }
                                        />
                                    </label>
                                )}
                                <button
                                    className="button primary"
                                    type="button"
                                    disabled={joining}
                                    onClick={(): void => {
                                        void handleJoin();
                                    }}
                                >
                                    {joining
                                        ? "Submitting..."
                                        : group.join_policy === "APPROVAL"
                                          ? "Request to join"
                                          : "Join group"}
                                </button>
                            </div>
                        )}
                        {role === "VISITOR" && pendingRequested && (
                            <p className="group-owner-note">
                                Your join request has been sent and is awaiting moderator approval.
                            </p>
                        )}
                    </section>

                    {accessible && (
                        <section className="group-section">
                            <div className="group-section-heading">
                                <div>
                                    <p className="group-section-kicker">COMMUNITY</p>
                                    <h2>Members</h2>
                                </div>
                                <span className="group-section-count">
                                    {group.member_count} total
                                </span>
                            </div>
                            {members.length > 0 ? (
                                <div className="group-request-list">
                                    {members.map((member: GroupMemberRecord): ReactNode => {
                                        const label: string =
                                            member.user?.display_name ?? member.user_id;
                                        const targetPath: string = member.user
                                            ? `/users/${encodeURIComponent(member.user.username)}`
                                            : `/users/id/${encodeURIComponent(member.user_id)}`;
                                        return (
                                            <Link
                                                className="group-request-person"
                                                key={member.user_id}
                                                to={targetPath}
                                            >
                                                <span className="group-person-avatar">
                                                    {label.charAt(0).toUpperCase()}
                                                </span>
                                                <span>
                                                    <strong>{label}</strong>
                                                    <small>
                                                        {member.user
                                                            ? `@${member.user.username} · `
                                                            : ""}
                                                        {member.role}
                                                    </small>
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="group-request-empty">
                                    <Users size={20} />
                                    <p>No members to display.</p>
                                </div>
                            )}
                        </section>
                    )}

                    {hasGroupPermission(role, "MANAGE_MEMBERS") &&
                        group.join_policy === "APPROVAL" && (
                            <section className="group-section group-requests">
                                <div className="group-section-heading">
                                    <div>
                                        <p className="group-section-kicker">MEMBERSHIP</p>
                                        <h2>Join requests</h2>
                                    </div>
                                    <span className="group-section-count">{requests.length}</span>
                                </div>
                                {requests.length > 0 ? (
                                    <div className="group-request-list">
                                        {requests.map(
                                            (request: JoinRequestRecord): ReactNode => {
                                                const applicantName: string =
                                                    request.user?.display_name ?? request.user_id;
                                                return (
                                                    <div
                                                        className="group-request"
                                                        key={request.id}
                                                    >
                                                        <div className="group-request-person">
                                                            <span className="group-person-avatar">
                                                                {applicantName
                                                                    .charAt(0)
                                                                    .toUpperCase()}
                                                            </span>
                                                            <div>
                                                                <strong>{applicantName}</strong>
                                                                <small>
                                                                    {request.user
                                                                        ? `@${request.user.username} · `
                                                                        : ""}
                                                                    Wants to join
                                                                </small>
                                                            </div>
                                                        </div>
                                                        <div className="group-request-actions">
                                                            <button
                                                                className="button"
                                                                type="button"
                                                                disabled={busyUser !== ""}
                                                                onClick={(): void => {
                                                                    void handleReviewRequest(
                                                                        request.id,
                                                                        "REJECTED"
                                                                    );
                                                                }}
                                                            >
                                                                Reject
                                                            </button>
                                                            <button
                                                                className="button primary"
                                                                type="button"
                                                                disabled={busyUser !== ""}
                                                                onClick={(): void => {
                                                                    void handleReviewRequest(
                                                                        request.id,
                                                                        "APPROVED"
                                                                    );
                                                                }}
                                                            >
                                                                Approve
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                        )}
                                    </div>
                                ) : (
                                    <div className="group-request-empty">
                                        <Inbox size={20} />
                                        <p>No pending join requests.</p>
                                    </div>
                                )}
                            </section>
                        )}
                </aside>
            </div>
        </div>
    );
}
