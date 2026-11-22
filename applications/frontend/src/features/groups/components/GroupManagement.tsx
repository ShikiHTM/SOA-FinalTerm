import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { useNavigate } from "react-router-dom";
import { groupsApi } from "../../../api/client";
import type {
    GroupBanRecord,
    GroupJoinPolicy,
    GroupMemberRecord,
    GroupRole,
    GroupSummary,
    GroupVisibility
} from "../../../api/types";
import { canManageMember, hasGroupPermission } from "../../../authorization/permissions";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { groupRoleOf, useApp } from "../../../shared/context";

export function GroupManagement({
    group,
    onUpdated
}: {
    group: GroupSummary;
    onUpdated: () => Promise<void>;
}): ReactNode {
    const { user }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();

    const [name, setName]: [string, Dispatch<SetStateAction<string>>] = useState<string>(group.name);
    const [description, setDescription]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>(group.description);
    const [visibility, setVisibility]: [GroupVisibility, Dispatch<SetStateAction<GroupVisibility>>] =
        useState<GroupVisibility>(group.visibility);
    const [policy, setPolicy]: ["APPROVAL" | "PASSWORD", Dispatch<SetStateAction<"APPROVAL" | "PASSWORD">>] =
        useState<"APPROVAL" | "PASSWORD">(
            group.join_policy === "PASSWORD" ? "PASSWORD" : "APPROVAL"
        );
    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [members, setMembers]: [
        GroupMemberRecord[],
        Dispatch<SetStateAction<GroupMemberRecord[]>>
    ] = useState<GroupMemberRecord[]>([]);
    const [bans, setBans]: [GroupBanRecord[], Dispatch<SetStateAction<GroupBanRecord[]>>] =
        useState<GroupBanRecord[]>([]);
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [message, setMessage]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const role: GroupRole = groupRoleOf(group);

    const loadMembersAndBans: () => Promise<void> = useCallback(async (): Promise<void> => {
        try {
            const [memberRes, banRes] = await Promise.all([
                groupsApi.listMembers(group.id, { page: 1, limit: 100 }),
                groupsApi.listBans(group.id, { page: 1, limit: 100 })
            ]);
            setMembers(memberRes.items);
            setBans(banRes.items);
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load members and bans."));
        }
    }, [group.id]);

    useEffect((): void => {
        void loadMembersAndBans();
    }, [loadMembersAndBans]);

    async function run(action: () => Promise<void>, successMessage: string): Promise<void> {
        setBusy(true);
        setError("");
        setMessage("");
        try {
            await action();
            await Promise.all([loadMembersAndBans(), onUpdated()]);
            setMessage(successMessage);
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to update group."));
        } finally {
            setBusy(false);
        }
    }

    async function saveSettings(event: FormEvent): Promise<void> {
        event.preventDefault();
        const nextPolicy: GroupJoinPolicy = visibility === "PUBLIC" ? "OPEN" : policy;
        await run(async (): Promise<void> => {
            await groupsApi.update(group.id, {
                name: name.trim(),
                description: description.trim(),
                visibility,
                join_policy: nextPolicy,
                password:
                    visibility === "PRIVATE" && nextPolicy === "PASSWORD" && password.length > 0
                        ? password
                        : undefined
            });
            setPassword("");
        }, "Group settings updated.");
    }

    return (
        <section className="group-section">
            <div className="group-section-heading">
                <div>
                    <p className="group-section-kicker">MEMBERSHIP &amp; SETTINGS</p>
                    <h2>Manage group</h2>
                </div>
                <span className="group-section-count">{members.length} members</span>
            </div>
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            {message && (
                <p className="notice" role="status">
                    {message}
                </p>
            )}
            {hasGroupPermission(role, "MANAGE_SETTINGS") && (
                <form
                    className="form"
                    onSubmit={(event: FormEvent): void => {
                        void saveSettings(event);
                    }}
                >
                    <label>
                        Group name
                        <input
                            value={name}
                            required
                            minLength={2}
                            maxLength={150}
                            onChange={(event): void => setName(event.target.value)}
                        />
                    </label>
                    <label>
                        Description
                        <textarea
                            value={description}
                            maxLength={2000}
                            onChange={(event): void => setDescription(event.target.value)}
                        />
                    </label>
                    <label>
                        Visibility
                        <select
                            value={visibility}
                            onChange={(event): void =>
                                setVisibility(event.target.value as GroupVisibility)
                            }
                        >
                            <option value="PUBLIC">Public (open join)</option>
                            <option value="PRIVATE">Private</option>
                        </select>
                    </label>
                    {visibility === "PRIVATE" && (
                        <label>
                            Join policy
                            <select
                                value={policy}
                                onChange={(event): void =>
                                    setPolicy(event.target.value as "APPROVAL" | "PASSWORD")
                                }
                            >
                                <option value="APPROVAL">Moderator approval</option>
                                <option value="PASSWORD">Shared password</option>
                            </select>
                        </label>
                    )}
                    {visibility === "PRIVATE" && policy === "PASSWORD" && (
                        <label>
                            New shared password
                            <input
                                type="password"
                                minLength={6}
                                maxLength={128}
                                required={group.join_policy !== "PASSWORD"}
                                placeholder={
                                    group.join_policy === "PASSWORD"
                                        ? "Leave blank to keep current password"
                                        : "Minimum 6 characters"
                                }
                                value={password}
                                onChange={(event): void => setPassword(event.target.value)}
                            />
                        </label>
                    )}
                    <button className="button primary" type="submit" disabled={busy}>
                        Save settings
                    </button>
                </form>
            )}

            <ul className="admin-list">
                {members.map((member: GroupMemberRecord): ReactNode => {
                    const memberName: string = member.user?.display_name ?? member.user_id;
                    const memberHandle: string = member.user
                        ? `@${member.user.username}`
                        : member.user_id;
                    const isSelf: boolean = member.user_id === user.id;
                    return (
                        <li className="admin-row" key={member.user_id}>
                            <span className="admin-row-copy">
                                <strong>{memberName}</strong>
                                <small>
                                    {memberHandle} · {member.role}
                                </small>
                            </span>
                            {hasGroupPermission(role, "ASSIGN_MODERATOR") && !isSelf && (
                                <button
                                    className="button"
                                    type="button"
                                    disabled={busy}
                                    onClick={(): void => {
                                        const nextRole: "MEMBER" | "MODERATOR" =
                                            member.role === "MODERATOR" ? "MEMBER" : "MODERATOR";
                                        void run(
                                            (): Promise<void> =>
                                                groupsApi
                                                    .updateMemberRole(
                                                        group.id,
                                                        member.user_id,
                                                        nextRole
                                                    )
                                                    .then((): void => undefined),
                                            "Member role updated."
                                        );
                                    }}
                                >
                                    {member.role === "MODERATOR"
                                        ? "Demote to Member"
                                        : "Promote to Moderator"}
                                </button>
                            )}
                            {hasGroupPermission(role, "TRANSFER_OWNERSHIP") && !isSelf && (
                                <button
                                    className="button"
                                    type="button"
                                    disabled={busy}
                                    onClick={(): void => {
                                        if (
                                            window.confirm(
                                                `Transfer group ownership to ${memberName}?`
                                            )
                                        ) {
                                            void run(
                                                (): Promise<void> =>
                                                    groupsApi
                                                        .transferOwnership(group.id, member.user_id)
                                                        .then((): void => undefined),
                                                "Ownership transferred."
                                            );
                                        }
                                    }}
                                >
                                    Transfer ownership
                                </button>
                            )}
                            {!isSelf && canManageMember(role, member.role) && (
                                <>
                                    <button
                                        className="button"
                                        type="button"
                                        disabled={busy}
                                        onClick={(): void => {
                                            if (window.confirm(`Remove ${memberName} from group?`)) {
                                                void run(
                                                    (): Promise<void> =>
                                                        groupsApi.removeMember(
                                                            group.id,
                                                            member.user_id
                                                        ),
                                                    "Member removed."
                                                );
                                            }
                                        }}
                                    >
                                        Remove
                                    </button>
                                    <button
                                        className="button"
                                        type="button"
                                        disabled={busy}
                                        onClick={(): void => {
                                            if (window.confirm(`Ban ${memberName} from group?`)) {
                                                const reason: string | null = window.prompt(
                                                    "Optional ban reason:"
                                                );
                                                void run(
                                                    (): Promise<void> =>
                                                        groupsApi
                                                            .banUser(
                                                                group.id,
                                                                member.user_id,
                                                                reason?.trim() || undefined
                                                            )
                                                            .then((): void => undefined),
                                                    "User banned from group."
                                                );
                                            }
                                        }}
                                    >
                                        Ban
                                    </button>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>

            {bans.length > 0 && (
                <div className="banned-list-block">
                    <h3>Banned users</h3>
                    {bans.map((ban: GroupBanRecord): ReactNode => {
                        const bannedName: string = ban.user?.display_name ?? ban.user_id;
                        return (
                            <div className="admin-row" key={ban.id}>
                                <span className="admin-row-copy">
                                    <strong>{bannedName}</strong>
                                    <small>{ban.reason || "No reason recorded."}</small>
                                </span>
                                <button
                                    className="button"
                                    type="button"
                                    disabled={busy}
                                    onClick={(): void => {
                                        void run(
                                            (): Promise<void> =>
                                                groupsApi.unbanUser(group.id, ban.user_id),
                                            "User unbanned."
                                        );
                                    }}
                                >
                                    Unban
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {hasGroupPermission(role, "DELETE_GROUP") && (
                <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={(): void => {
                        if (
                            window.confirm(
                                "Delete this group and remove all memberships? This cannot be undone."
                            )
                        ) {
                            void run(async (): Promise<void> => {
                                await groupsApi.delete(group.id);
                                navigate("/groups", { replace: true });
                            }, "Group deleted.");
                        }
                    }}
                >
                    Delete group
                </button>
            )}
        </section>
    );
}
