import { CalendarDays } from "lucide-react";
import {
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { assessmentsApi, contestsApi, groupsApi } from "../../../api/client";
import type {
    AssessmentMetadata,
    ContestSubmissionPolicy,
    ContestSummary,
    ContestVisibility,
    GroupSummary
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { canManage, useApp } from "../../../shared/context";

export function NewContest(): ReactNode {
    const { user }: ReturnType<typeof useApp> = useApp();
    const location: ReturnType<typeof useLocation> = useLocation();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const initialGroupId: string = new URLSearchParams(location.search).get("group") ?? "";

    const [managedGroups, setManagedGroups]: [GroupSummary[], Dispatch<SetStateAction<GroupSummary[]>>] =
        useState<GroupSummary[]>([]);
    const [groupId, setGroupId]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>(initialGroupId);
    const [assessments, setAssessments]: [
        AssessmentMetadata[],
        Dispatch<SetStateAction<AssessmentMetadata[]>>
    ] = useState<AssessmentMetadata[]>([]);

    const [title, setTitle]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [description, setDescription]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [assessmentId, setAssessmentId]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [visibility, setVisibility]: [
        ContestVisibility,
        Dispatch<SetStateAction<ContestVisibility>>
    ] = useState<ContestVisibility>("PUBLIC");
    const [status, setStatus]: ["PUBLISHED" | "DRAFT", Dispatch<SetStateAction<"PUBLISHED" | "DRAFT">>] =
        useState<"PUBLISHED" | "DRAFT">("PUBLISHED");
    const [startAt, setStartAt]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [endAt, setEndAt]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [policy, setPolicy]: [
        ContestSubmissionPolicy,
        Dispatch<SetStateAction<ContestSubmissionPolicy>>
    ] = useState<ContestSubmissionPolicy>("SINGLE");
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        setLoading(true);
        void groupsApi
            .listMine({ page: 1, limit: 100 })
            .then((res): void => {
                const manageable: GroupSummary[] = res.items.filter((item): boolean =>
                    canManage(item, user.system_role)
                );
                setManagedGroups(manageable);
                if (!initialGroupId && manageable.length > 0) {
                    setGroupId(manageable[0].id);
                }
            })
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load managed groups."));
            })
            .finally((): void => setLoading(false));
    }, [initialGroupId, user.system_role]);

    useEffect((): void => {
        if (!groupId) {
            setAssessments([]);
            setAssessmentId("");
            return;
        }
        void assessmentsApi
            .listByGroup({ group_id: groupId, page: 1, limit: 100 })
            .then((res): void => {
                setAssessments(res.items);
                setAssessmentId((current: string): string =>
                    res.items.some((item): boolean => item.id === current)
                        ? current
                        : (res.items[0]?.id ?? "")
                );
            })
            .catch((reason: unknown): void => {
                setError(extractErrorMessage(reason, "Unable to load group assessments."));
            });
    }, [groupId]);

    async function handleCreate(event: FormEvent): Promise<void> {
        event.preventDefault();
        if (
            !groupId ||
            !title.trim() ||
            !assessmentId ||
            !startAt ||
            !endAt ||
            Date.parse(startAt) >= Date.parse(endAt)
        ) {
            setError("Verify title, group, assessment, and that end time follows start time.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const created: ContestSummary = await contestsApi.create({
                group_id: groupId,
                assessment_id: assessmentId,
                title: title.trim(),
                description: description.trim(),
                visibility,
                start_time: new Date(startAt).toISOString(),
                end_time: new Date(endAt).toISOString(),
                submission_policy: policy,
                status
            });
            navigate(`/contests/${created.id}`);
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to create contest."));
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return <p className="muted">Loading contest setup...</p>;
    }
    if (managedGroups.length === 0) {
        return (
            <p className="empty">
                You must be an Owner or Moderator of a group to schedule a contest.
            </p>
        );
    }

    const activeGroup: GroupSummary | undefined = managedGroups.find(
        (item): boolean => item.id === groupId
    );

    return (
        <div className="contest-create-page page-enter">
            <div className="assessment-breadcrumb">
                <Link to={activeGroup ? `/groups/${activeGroup.id}` : "/contests"}>
                    {activeGroup?.name ?? "Contests"}
                </Link>
                <span>/</span>
                <span>Create contest</span>
            </div>
            <header className="assessment-hero">
                <span className="assessment-hero-icon">
                    <CalendarDays size={25} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>CONTEST MANAGEMENT</span>
                    </div>
                    <h1>Create contest</h1>
                    <p>Bind a group assessment to a scheduled time window and submission policy.</p>
                </div>
            </header>
            <form
                className="assessment-section form contest-create-form"
                onSubmit={(event): void => {
                    void handleCreate(event);
                }}
            >
                <div className="contest-create-heading">
                    <p className="assessment-section-kicker">CONFIGURATION</p>
                    <h2>Contest settings</h2>
                </div>
                <label>
                    Group
                    <select
                        required
                        value={groupId}
                        onChange={(event): void => setGroupId(event.target.value)}
                    >
                        <option value="">Select managed group</option>
                        {managedGroups.map(
                            (group: GroupSummary): ReactNode => (
                                <option value={group.id} key={group.id}>
                                    {group.name}
                                </option>
                            )
                        )}
                    </select>
                </label>
                <label>
                    Contest title
                    <input
                        required
                        minLength={2}
                        maxLength={255}
                        value={title}
                        onChange={(event): void => setTitle(event.target.value)}
                    />
                </label>
                <label>
                    Description
                    <textarea
                        rows={2}
                        maxLength={4000}
                        value={description}
                        onChange={(event): void => setDescription(event.target.value)}
                    />
                </label>
                <label>
                    Assessment
                    <select
                        required
                        value={assessmentId}
                        onChange={(event): void => setAssessmentId(event.target.value)}
                    >
                        <option value="">Select assessment</option>
                        {assessments.map(
                            (exam: AssessmentMetadata): ReactNode => (
                                <option value={exam.id} key={exam.id}>
                                    {exam.title} (v{exam.version} · {exam.total_points} pts ·{" "}
                                    {exam.visibility})
                                </option>
                            )
                        )}
                    </select>
                </label>
                {assessments.length === 0 && groupId && (
                    <p className="hint">
                        This group has no assessments yet. Create an assessment first before
                        scheduling a contest.
                    </p>
                )}
                <div className="two-col">
                    <label>
                        Start time
                        <input
                            type="datetime-local"
                            required
                            value={startAt}
                            onChange={(event): void => setStartAt(event.target.value)}
                        />
                    </label>
                    <label>
                        End time
                        <input
                            type="datetime-local"
                            required
                            value={endAt}
                            onChange={(event): void => setEndAt(event.target.value)}
                        />
                    </label>
                </div>
                <div className="two-col">
                    <label>
                        Visibility
                        <select
                            value={visibility}
                            onChange={(event): void =>
                                setVisibility(event.target.value as ContestVisibility)
                            }
                        >
                            <option value="PUBLIC">Public</option>
                            <option value="PRIVATE">Private (group members only)</option>
                        </select>
                    </label>
                    <label>
                        Submission policy
                        <select
                            value={policy}
                            onChange={(event): void =>
                                setPolicy(event.target.value as ContestSubmissionPolicy)
                            }
                        >
                            <option value="SINGLE">Single attempt</option>
                            <option value="MULTIPLE">Multiple attempts (final attempt scored)</option>
                        </select>
                    </label>
                </div>
                <label>
                    Initial status
                    <select
                        value={status}
                        onChange={(event): void =>
                            setStatus(event.target.value as "PUBLISHED" | "DRAFT")
                        }
                    >
                        <option value="PUBLISHED">Published</option>
                        <option value="DRAFT">Draft</option>
                    </select>
                </label>
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <button className="button primary" disabled={busy || assessments.length === 0}>
                    {busy ? "Creating..." : "Create contest"}
                </button>
            </form>
        </div>
    );
}
