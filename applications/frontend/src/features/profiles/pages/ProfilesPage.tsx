import {
    AlertTriangle,
    ArrowRight,
    Award,
    BookOpen,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Copy,
    Flame,
    Heart,
    Lock,
    Mail,
    Settings,
    UserCheck,
    UserPlus,
    Users
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type MouseEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { assessmentsApi, groupsApi, submissionsApi, usersApi } from "../../../api/client";
import type {
    GroupSummary,
    OwnUserProfile,
    PaginatedResult,
    PrivacySettings,
    PublicUserProfile,
    SubmissionRecord,
    UserFollowItem
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { formatDate, formatShortDate } from "../../../shared/context";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { computeSubmissionStats, type SubmissionStatsSummary } from "../utils/activityHeatmap";

const PAGE_LIMIT: number = 8;

type ProfileTab = "overview" | "network" | "settings";

export function ProfilesPage({
    currentUser,
    onProfileUpdated,
    themeControl
}: {
    currentUser: OwnUserProfile | null;
    onProfileUpdated?: () => Promise<void>;
    themeControl?: ReactNode;
}): ReactNode {
    const { username: routeUsername, userId: routeUserId }: { username?: string; userId?: string } =
        useParams();
    const location: ReturnType<typeof useLocation> = useLocation();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();

    const isOwnRoute: boolean =
        !routeUsername &&
        !routeUserId &&
        Boolean(currentUser);
    const isSelfView: boolean = Boolean(
        currentUser &&
            (isOwnRoute ||
                (routeUsername && routeUsername.toLowerCase() === currentUser.username.toLowerCase()) ||
                (routeUserId && routeUserId === currentUser.id))
    );

    const [activeTab, setActiveTab]: [ProfileTab, Dispatch<SetStateAction<ProfileTab>>] =
        useState<ProfileTab>("overview");
    const [ownProfile, setOwnProfile]: [OwnUserProfile | null, Dispatch<SetStateAction<OwnUserProfile | null>>] =
        useState<OwnUserProfile | null>(null);
    const [publicProfile, setPublicProfile]: [
        PublicUserProfile | null,
        Dispatch<SetStateAction<PublicUserProfile | null>>
    ] = useState<PublicUserProfile | null>(null);

    const [submissions, setSubmissions]: [SubmissionRecord[], Dispatch<SetStateAction<SubmissionRecord[]>>] =
        useState<SubmissionRecord[]>([]);
    const [submissionsTotal, setSubmissionsTotal]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(0);
    const [myGroups, setMyGroups]: [GroupSummary[], Dispatch<SetStateAction<GroupSummary[]>>] =
        useState<GroupSummary[]>([]);
    const [groupsTotal, setGroupsTotal]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(0);
    const [favoritesTotal, setFavoritesTotal]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(0);

    const [networkMode, setNetworkMode]: [
        "followers" | "following",
        Dispatch<SetStateAction<"followers" | "following">>
    ] = useState<"followers" | "following">("followers");
    const [networkPage, setNetworkPage]: [number, Dispatch<SetStateAction<number>>] =
        useState<number>(1);
    const [networkResult, setNetworkResult]: [
        PaginatedResult<UserFollowItem> | null,
        Dispatch<SetStateAction<PaginatedResult<UserFollowItem> | null>>
    ] = useState<PaginatedResult<UserFollowItem> | null>(null);
    const [networkError, setNetworkError]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");

    const [editDisplayName, setEditDisplayName]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [editUsername, setEditUsername]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [editBio, setEditBio]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [editAvatarUrl, setEditAvatarUrl]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [privacy, setPrivacy]: [PrivacySettings, Dispatch<SetStateAction<PrivacySettings>>] =
        useState<PrivacySettings>({
            show_email: false,
            show_bio: true,
            show_followers: true,
            show_following: true
        });

    const [currentPassword, setCurrentPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [newPassword, setNewPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [confirmPassword, setConfirmPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");

    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [notice, setNotice]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const loadProfile: () => Promise<void> = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError("");
        try {
            if (isSelfView) {
                const [me, subsRes, groupsRes, favRes] = await Promise.all([
                    usersApi.getMe(),
                    submissionsApi.listMine({ page: 1, limit: 100 }),
                    groupsApi.listMine({ page: 1, limit: 6 }),
                    assessmentsApi.listFavorites({ page: 1, limit: 1 })
                ]);
                setOwnProfile(me);
                setPublicProfile(null);
                setSubmissions(subsRes.items);
                setSubmissionsTotal(subsRes.pagination.total);
                setMyGroups(groupsRes.items);
                setGroupsTotal(groupsRes.pagination.total);
                setFavoritesTotal(favRes.pagination.total);
                setEditDisplayName(me.display_name);
                setEditUsername(me.username);
                setEditBio(me.bio ?? "");
                setEditAvatarUrl(me.avatar_url ?? "");
                setPrivacy(me.privacy_settings);
            } else if (routeUsername) {
                const profile: PublicUserProfile = await usersApi.getByUsername(routeUsername);
                setPublicProfile(profile);
                setOwnProfile(null);
            } else if (routeUserId) {
                const profile: PublicUserProfile = await usersApi.getById(routeUserId);
                setPublicProfile(profile);
                setOwnProfile(null);
            }
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load user profile."));
        } finally {
            setLoading(false);
        }
    }, [isSelfView, routeUserId, routeUsername]);

    useEffect((): void => {
        setActiveTab("overview");
        setNetworkPage(1);
        void loadProfile();
    }, [loadProfile]);

    const viewedUserId: string | undefined = ownProfile?.id ?? publicProfile?.id;

    useEffect((): void => {
        if (!viewedUserId || activeTab !== "network") {
            return;
        }
        setNetworkError("");
        const loader =
            networkMode === "followers" ? usersApi.listFollowers : usersApi.listFollowing;
        void loader(viewedUserId, { page: networkPage, limit: PAGE_LIMIT })
            .then((res): void => setNetworkResult(res))
            .catch((reason: unknown): void => {
                setNetworkResult(null);
                setNetworkError(extractErrorMessage(reason, "Unable to load network list."));
            });
    }, [activeTab, networkMode, networkPage, viewedUserId]);

    async function handleToggleFollow(): Promise<void> {
        if (!publicProfile || !currentUser) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            const result = publicProfile.is_following
                ? await usersApi.unfollow(publicProfile.id)
                : await usersApi.follow(publicProfile.id);
            setPublicProfile({
                ...publicProfile,
                is_following: result.following,
                followers_count:
                    publicProfile.followers_count !== null ? result.followers_count : null
            });
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to update follow status."));
        } finally {
            setBusy(false);
        }
    }

    async function handleSaveProfile(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const updated: OwnUserProfile = await usersApi.updateMe({
                display_name: editDisplayName.trim(),
                username: editUsername.trim(),
                bio: editBio.trim().length > 0 ? editBio.trim() : null,
                avatar_url: editAvatarUrl.trim().length > 0 ? editAvatarUrl.trim() : null,
                privacy_settings: privacy
            });
            setOwnProfile(updated);
            await onProfileUpdated?.();
            setNotice("Profile settings updated.");
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to save profile."));
        } finally {
            setBusy(false);
        }
    }

    async function handleChangePassword(event: FormEvent): Promise<void> {
        event.preventDefault();
        setError("");
        setNotice("");
        if (newPassword !== confirmPassword) {
            setError("New password and confirmation do not match.");
            return;
        }
        setBusy(true);
        try {
            await usersApi.changePassword(currentPassword, newPassword);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setNotice("Password updated.");
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to change password."));
        } finally {
            setBusy(false);
        }
    }

    const identity: OwnUserProfile | PublicUserProfile | null = ownProfile ?? publicProfile;
    const stats: SubmissionStatsSummary = computeSubmissionStats(submissions);
    const fallbackPath: string = currentUser ? "/" : "/discover";

    const content: ReactNode = (
        <div className="profile-page page-enter">
            <div className="profile-topbar-nav">
                <Link
                    className="back-link"
                    to={fallbackPath}
                    onClick={(event: MouseEvent<HTMLAnchorElement>): void => {
                        event.preventDefault();
                        if (location.key !== "default") {
                            navigate(-1);
                        } else {
                            navigate(fallbackPath, { replace: true });
                        }
                    }}
                >
                    ← Back
                </Link>
            </div>

            {error && (
                <p className="error profile-feedback" role="alert">
                    {error}
                </p>
            )}
            {notice && (
                <p className="notice profile-feedback" role="status">
                    {notice}
                </p>
            )}

            {loading ? (
                <div className="panel skeleton-block">Loading profile...</div>
            ) : identity ? (
                <div className="profile-dashboard">
                    <aside className="profile-sidebar">
                        <section className="panel profile-identity-card">
                            <div className="profile-identity-top">
                                {identity.avatar_url ? (
                                    <img
                                        className="profile-avatar-img"
                                        src={identity.avatar_url}
                                        alt={identity.display_name}
                                    />
                                ) : (
                                    <div className="profile-avatar profile-avatar-large" aria-hidden="true">
                                        {identity.display_name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <h1>{identity.display_name}</h1>
                                    <p className="profile-handle">@{identity.username}</p>
                                </div>
                            </div>

                            {"restricted" in identity && identity.restricted && (
                                <div className="restricted-banner" role="status">
                                    <AlertTriangle size={15} />
                                    <span>RESTRICTED · Account status: {identity.status}</span>
                                </div>
                            )}

                            <p className="profile-bio">{identity.bio || "No bio provided yet."}</p>

                            <dl className="profile-meta-list">
                                {identity.email && (
                                    <div>
                                        <dt>
                                            <Mail size={14} /> Email
                                        </dt>
                                        <dd>{identity.email}</dd>
                                    </div>
                                )}
                                <div>
                                    <dt>
                                        <CalendarDays size={14} /> Joined
                                    </dt>
                                    <dd>{formatShortDate(identity.created_at)}</dd>
                                </div>
                                <div>
                                    <dt>
                                        <Users size={14} /> Network
                                    </dt>
                                    <dd>
                                        <strong>
                                            {identity.followers_count ?? "Private"}
                                        </strong>{" "}
                                        followers ·{" "}
                                        <strong>
                                            {identity.following_count ?? "Private"}
                                        </strong>{" "}
                                        following
                                    </dd>
                                </div>
                            </dl>

                            {ownProfile && ownProfile.linked_providers.length > 0 && (
                                <div className="profile-oauth-links">
                                    <span className="eyebrow">LINKED PROVIDERS</span>
                                    <div className="oauth-badge-row">
                                        {ownProfile.linked_providers.map((provider): ReactNode => (
                                            <span className="badge" key={provider}>
                                                <CheckCircle2 size={12} /> {provider}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="profile-sidebar-actions">
                                <button
                                    className="button"
                                    type="button"
                                    onClick={(): void => {
                                        const shareUrl: string = `${window.location.origin}/users/${encodeURIComponent(identity.username)}`;
                                        void navigator.clipboard.writeText(shareUrl).then(
                                            (): void => {
                                                setNotice("Profile URL copied to clipboard.");
                                                setError("");
                                            },
                                            (): void => setError("Unable to copy profile URL.")
                                        );
                                    }}
                                >
                                    <Copy size={15} /> Copy profile link
                                </button>
                                {!isSelfView && currentUser && publicProfile && (
                                    <button
                                        className={`button ${publicProfile.is_following ? "" : "primary"}`}
                                        type="button"
                                        disabled={busy}
                                        onClick={(): void => {
                                            void handleToggleFollow();
                                        }}
                                    >
                                        {publicProfile.is_following ? (
                                            <>
                                                <UserCheck size={15} /> Following
                                            </>
                                        ) : (
                                            <>
                                                <UserPlus size={15} /> Follow
                                            </>
                                        )}
                                    </button>
                                )}
                                {!currentUser && (
                                    <Link className="button primary" to="/login">
                                        Sign in to follow
                                    </Link>
                                )}
                            </div>
                        </section>
                    </aside>

                    <div className="profile-main">
                        <section className="profile-kpi-grid" aria-label="Profile statistics">
                            {isSelfView ? (
                                <>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <ClipboardList size={18} />
                                        </span>
                                        <div>
                                            <span>Submissions</span>
                                            <strong>{submissionsTotal}</strong>
                                        </div>
                                    </article>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <Award size={18} />
                                        </span>
                                        <div>
                                            <span>Average score</span>
                                            <strong>
                                                {stats.averagePercent !== null
                                                    ? `${stats.averagePercent}%`
                                                    : "—"}
                                            </strong>
                                        </div>
                                    </article>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <Users size={18} />
                                        </span>
                                        <div>
                                            <span>Groups joined</span>
                                            <strong>{groupsTotal}</strong>
                                        </div>
                                    </article>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <Heart size={18} />
                                        </span>
                                        <div>
                                            <span>Favorites</span>
                                            <strong>{favoritesTotal}</strong>
                                        </div>
                                    </article>
                                </>
                            ) : (
                                <>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <Users size={18} />
                                        </span>
                                        <div>
                                            <span>Followers</span>
                                            <strong>{identity.followers_count ?? "Private"}</strong>
                                        </div>
                                    </article>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <UserCheck size={18} />
                                        </span>
                                        <div>
                                            <span>Following</span>
                                            <strong>{identity.following_count ?? "Private"}</strong>
                                        </div>
                                    </article>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <Flame size={18} />
                                        </span>
                                        <div>
                                            <span>Account status</span>
                                            <strong>{identity.status}</strong>
                                        </div>
                                    </article>
                                    <article className="panel profile-kpi-card">
                                        <span className="profile-kpi-icon">
                                            <CalendarDays size={18} />
                                        </span>
                                        <div>
                                            <span>Member since</span>
                                            <strong>{formatShortDate(identity.created_at)}</strong>
                                        </div>
                                    </article>
                                </>
                            )}
                        </section>

                        <div className="tabs" role="tablist" aria-label="Profile sections">
                            <button
                                className={activeTab === "overview" ? "active" : ""}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "overview"}
                                onClick={(): void => setActiveTab("overview")}
                            >
                                Overview
                            </button>
                            <button
                                className={activeTab === "network" ? "active" : ""}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "network"}
                                onClick={(): void => setActiveTab("network")}
                            >
                                Network
                            </button>
                            {isSelfView && (
                                <button
                                    className={activeTab === "settings" ? "active" : ""}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === "settings"}
                                    onClick={(): void => setActiveTab("settings")}
                                >
                                    <Settings size={14} /> Settings
                                </button>
                            )}
                        </div>

                        {activeTab === "overview" && (
                            <div className="profile-tab-content">
                                {isSelfView ? (
                                    <>
                                        <ActivityHeatmap
                                            timestamps={submissions.map(
                                                (item: SubmissionRecord): string => item.submitted_at
                                            )}
                                        />

                                        <section className="panel">
                                            <div className="profile-section-heading">
                                                <div>
                                                    <p className="eyebrow">RECENT SUBMISSIONS</p>
                                                    <h2>Attempt log</h2>
                                                </div>
                                                <Link className="button button-small" to="/submissions">
                                                    View all <ArrowRight size={13} />
                                                </Link>
                                            </div>
                                            {submissions.length > 0 ? (
                                                <ul className="resource-list">
                                                    {submissions.slice(0, 6).map(
                                                        (sub: SubmissionRecord): ReactNode => (
                                                            <li key={sub.id}>
                                                                <Link
                                                                    className="resource-row"
                                                                    to={`/submissions/${sub.id}`}
                                                                >
                                                                    <span className="resource-row-icon">
                                                                        <ClipboardList size={17} />
                                                                    </span>
                                                                    <div className="resource-row-main">
                                                                        <div className="resource-row-title">
                                                                            <strong>
                                                                                {sub.contest
                                                                                    ?.title ??
                                                                                    (sub.submission_mode ===
                                                                                    "PRACTICE"
                                                                                        ? "Practice Attempt"
                                                                                        : "Contest Submission")}
                                                                            </strong>
                                                                            <span className="badge">
                                                                                {sub.grading_status}
                                                                            </span>
                                                                        </div>
                                                                        <div className="resource-row-meta">
                                                                            <span>
                                                                                {sub.submission_mode}
                                                                            </span>
                                                                            <span>
                                                                                Attempt #
                                                                                {sub.attempt_number}
                                                                            </span>
                                                                            <span>
                                                                                {formatDate(
                                                                                    sub.submitted_at
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <span className="resource-row-cta">
                                                                        {sub.total_score !== null
                                                                            ? `${sub.total_score}/${sub.max_score}`
                                                                            : "Pending"}
                                                                    </span>
                                                                </Link>
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            ) : (
                                                <p className="muted">
                                                    No submissions yet. Join a contest or practice
                                                    assessment to populate your activity chart.
                                                </p>
                                            )}
                                        </section>

                                        <section className="panel">
                                            <div className="profile-section-heading">
                                                <div>
                                                    <p className="eyebrow">COMMUNITIES</p>
                                                    <h2>Joined groups</h2>
                                                </div>
                                                <Link className="button button-small" to="/groups">
                                                    Manage groups <ArrowRight size={13} />
                                                </Link>
                                            </div>
                                            {myGroups.length > 0 ? (
                                                <ul className="resource-list">
                                                    {myGroups.map(
                                                        (group: GroupSummary): ReactNode => (
                                                            <li key={group.id}>
                                                                <Link
                                                                    className="resource-row"
                                                                    to={`/groups/${group.id}`}
                                                                >
                                                                    <span className="resource-row-icon">
                                                                        <Users size={17} />
                                                                    </span>
                                                                    <div className="resource-row-main">
                                                                        <div className="resource-row-title">
                                                                            <strong>
                                                                                {group.name}
                                                                            </strong>
                                                                            <span className="badge">
                                                                                {group.my_role ??
                                                                                    "MEMBER"}
                                                                            </span>
                                                                        </div>
                                                                        <div className="resource-row-meta">
                                                                            <span>
                                                                                Code:{" "}
                                                                                {group.group_code}
                                                                            </span>
                                                                            <span>
                                                                                {group.member_count}{" "}
                                                                                members
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <span className="resource-row-cta">
                                                                        Open <ArrowRight size={13} />
                                                                    </span>
                                                                </Link>
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            ) : (
                                                <p className="muted">
                                                    You have not joined any groups yet.
                                                </p>
                                            )}
                                        </section>
                                    </>
                                ) : (
                                    <section className="panel">
                                        <p className="eyebrow">PUBLIC OVERVIEW</p>
                                        <h2>Community profile</h2>
                                        <p className="muted">
                                            Detailed submission history and group memberships are
                                            private to each learner. Use the Network tab to browse
                                            followers and followed learners.
                                        </p>
                                    </section>
                                )}
                            </div>
                        )}

                        {activeTab === "network" && (
                            <section className="panel">
                                <div className="profile-section-heading">
                                    <div>
                                        <p className="eyebrow">CONNECTIONS</p>
                                        <h2>
                                            {networkMode === "followers" ? "Followers" : "Following"}
                                        </h2>
                                    </div>
                                    <div className="exam-filters">
                                        <button
                                            type="button"
                                            className={networkMode === "followers" ? "selected" : ""}
                                            onClick={(): void => {
                                                setNetworkMode("followers");
                                                setNetworkPage(1);
                                            }}
                                        >
                                            Followers
                                        </button>
                                        <button
                                            type="button"
                                            className={networkMode === "following" ? "selected" : ""}
                                            onClick={(): void => {
                                                setNetworkMode("following");
                                                setNetworkPage(1);
                                            }}
                                        >
                                            Following
                                        </button>
                                    </div>
                                </div>
                                {networkError ? (
                                    <div className="profile-private-notice">
                                        <Lock size={17} />
                                        <span>{networkError}</span>
                                    </div>
                                ) : networkResult && networkResult.items.length > 0 ? (
                                    <>
                                        <ul className="resource-list">
                                            {networkResult.items.map(
                                                (person: UserFollowItem): ReactNode => (
                                                    <li key={person.id}>
                                                        <Link
                                                            className="resource-row"
                                                            to={`/users/${encodeURIComponent(person.username)}`}
                                                        >
                                                            <span className="profile-avatar">
                                                                {person.display_name
                                                                    .charAt(0)
                                                                    .toUpperCase()}
                                                            </span>
                                                            <div className="resource-row-main">
                                                                <strong>
                                                                    {person.display_name}
                                                                </strong>
                                                                <small>
                                                                    @{person.username} · Connected{" "}
                                                                    {formatShortDate(
                                                                        person.followed_at
                                                                    )}
                                                                </small>
                                                            </div>
                                                            <span className="resource-row-cta">
                                                                View profile{" "}
                                                                <ArrowRight size={14} />
                                                            </span>
                                                        </Link>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                        <Pagination
                                            pagination={networkResult.pagination}
                                            onPageChange={setNetworkPage}
                                            itemLabel="users"
                                        />
                                    </>
                                ) : (
                                    <p className="muted">No users to display.</p>
                                )}
                            </section>
                        )}

                        {activeTab === "settings" && ownProfile && (
                            <div className="profile-sections">
                                <section className="panel profile-section">
                                    <p className="eyebrow">PERSONAL</p>
                                    <h2>Edit profile &amp; privacy</h2>
                                    <form
                                        className="form"
                                        onSubmit={(event: FormEvent): void => {
                                            void handleSaveProfile(event);
                                        }}
                                    >
                                        <label>
                                            Display name
                                            <input
                                                value={editDisplayName}
                                                required
                                                maxLength={120}
                                                onChange={(event): void =>
                                                    setEditDisplayName(event.target.value)
                                                }
                                            />
                                        </label>
                                        <label>
                                            Username
                                            <input
                                                value={editUsername}
                                                required
                                                minLength={3}
                                                maxLength={64}
                                                pattern="[a-zA-Z0-9_.-]+"
                                                onChange={(event): void =>
                                                    setEditUsername(event.target.value)
                                                }
                                            />
                                        </label>
                                        <label>
                                            Avatar URL
                                            <input
                                                type="url"
                                                maxLength={2048}
                                                placeholder="https://..."
                                                value={editAvatarUrl}
                                                onChange={(event): void =>
                                                    setEditAvatarUrl(event.target.value)
                                                }
                                            />
                                        </label>
                                        <label>
                                            Bio
                                            <textarea
                                                rows={3}
                                                maxLength={500}
                                                value={editBio}
                                                onChange={(event): void =>
                                                    setEditBio(event.target.value)
                                                }
                                            />
                                        </label>
                                        <div className="privacy-grid">
                                            <label className="check">
                                                <input
                                                    type="checkbox"
                                                    checked={privacy.show_email}
                                                    onChange={(event): void =>
                                                        setPrivacy({
                                                            ...privacy,
                                                            show_email: event.target.checked
                                                        })
                                                    }
                                                />
                                                Show email on public profile
                                            </label>
                                            <label className="check">
                                                <input
                                                    type="checkbox"
                                                    checked={privacy.show_bio}
                                                    onChange={(event): void =>
                                                        setPrivacy({
                                                            ...privacy,
                                                            show_bio: event.target.checked
                                                        })
                                                    }
                                                />
                                                Show bio on public profile
                                            </label>
                                            <label className="check">
                                                <input
                                                    type="checkbox"
                                                    checked={privacy.show_followers}
                                                    onChange={(event): void =>
                                                        setPrivacy({
                                                            ...privacy,
                                                            show_followers: event.target.checked
                                                        })
                                                    }
                                                />
                                                Show followers list publicly
                                            </label>
                                            <label className="check">
                                                <input
                                                    type="checkbox"
                                                    checked={privacy.show_following}
                                                    onChange={(event): void =>
                                                        setPrivacy({
                                                            ...privacy,
                                                            show_following: event.target.checked
                                                        })
                                                    }
                                                />
                                                Show following list publicly
                                            </label>
                                        </div>
                                        <button className="button primary" type="submit" disabled={busy}>
                                            Save profile
                                        </button>
                                    </form>
                                </section>

                                <section className="panel profile-section">
                                    <p className="eyebrow">SECURITY</p>
                                    <h2>Change password</h2>
                                    {ownProfile.has_password ? (
                                        <form
                                            className="form"
                                            onSubmit={(event: FormEvent): void => {
                                                void handleChangePassword(event);
                                            }}
                                        >
                                            <label>
                                                Current password
                                                <input
                                                    type="password"
                                                    autoComplete="current-password"
                                                    required
                                                    value={currentPassword}
                                                    onChange={(event): void =>
                                                        setCurrentPassword(event.target.value)
                                                    }
                                                />
                                            </label>
                                            <label>
                                                New password
                                                <input
                                                    type="password"
                                                    autoComplete="new-password"
                                                    minLength={8}
                                                    maxLength={128}
                                                    required
                                                    value={newPassword}
                                                    onChange={(event): void =>
                                                        setNewPassword(event.target.value)
                                                    }
                                                />
                                            </label>
                                            <label>
                                                Confirm new password
                                                <input
                                                    type="password"
                                                    autoComplete="new-password"
                                                    minLength={8}
                                                    maxLength={128}
                                                    required
                                                    value={confirmPassword}
                                                    onChange={(event): void =>
                                                        setConfirmPassword(event.target.value)
                                                    }
                                                />
                                            </label>
                                            <button
                                                className="button primary"
                                                type="submit"
                                                disabled={busy}
                                            >
                                                Update password
                                            </button>
                                        </form>
                                    ) : (
                                        <p className="muted">
                                            This account signs in through a linked OAuth provider and
                                            does not use a local password.
                                        </p>
                                    )}
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <section className="panel profile-empty-state">
                    <h2>Profile not found</h2>
                    <p>This profile may not exist or is no longer available.</p>
                    <Link className="button" to={fallbackPath}>
                        Go back
                    </Link>
                </section>
            )}
        </div>
    );

    if (themeControl) {
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
                <main className="main guest-main">{content}</main>
            </div>
        );
    }

    return content;
}
