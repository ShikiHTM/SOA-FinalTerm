import {
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { groupsApi } from "../../../api/client";
import type { GroupSummary, GroupVisibility } from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { PageTitle } from "../../../shared/context";

export function NewGroup(): ReactNode {
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const [name, setName]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [description, setDescription]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [visibility, setVisibility]: [GroupVisibility, Dispatch<SetStateAction<GroupVisibility>>] =
        useState<GroupVisibility>("PUBLIC");
    const [policy, setPolicy]: [
        "APPROVAL" | "PASSWORD",
        Dispatch<SetStateAction<"APPROVAL" | "PASSWORD">>
    ] = useState<"APPROVAL" | "PASSWORD">("APPROVAL");
    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    async function create(event: FormEvent): Promise<void> {
        event.preventDefault();
        if (!name.trim()) {
            setError("Group name is required.");
            return;
        }
        if (visibility === "PRIVATE" && policy === "PASSWORD" && password.length < 6) {
            setError("Group password must be at least 6 characters.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const created: GroupSummary = await groupsApi.create({
                name: name.trim(),
                description: description.trim(),
                visibility,
                join_policy: visibility === "PUBLIC" ? "OPEN" : policy,
                password: visibility === "PRIVATE" && policy === "PASSWORD" ? password : undefined
            });
            navigate(`/groups/${created.id}`);
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to create group."));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="page-enter">
            <Link className="back" to="/groups">
                ← Back to Groups
            </Link>
            <PageTitle
                label="GROUP MANAGEMENT"
                title="Create learning group"
                description="Set up a shared space for members, group assessments, and scheduled contests."
            />
            <form
                className="panel form editor"
                onSubmit={(event): void => {
                    void create(event);
                }}
            >
                <label>
                    Group name
                    <input
                        required
                        minLength={2}
                        maxLength={150}
                        value={name}
                        onChange={(event): void => setName(event.target.value)}
                    />
                </label>
                <label>
                    Description
                    <textarea
                        rows={3}
                        maxLength={2000}
                        value={description}
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
                    <>
                        <label>
                            Join policy
                            <select
                                value={policy}
                                onChange={(event): void =>
                                    setPolicy(event.target.value as "APPROVAL" | "PASSWORD")
                                }
                            >
                                <option value="APPROVAL">Moderator approval</option>
                                <option value="PASSWORD">Shared group password</option>
                            </select>
                        </label>
                        {policy === "PASSWORD" && (
                            <label>
                                Group password
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    maxLength={128}
                                    value={password}
                                    onChange={(event): void => setPassword(event.target.value)}
                                />
                            </label>
                        )}
                    </>
                )}
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <button className="button primary" disabled={busy}>
                    {busy ? "Creating..." : "Create group"}
                </button>
            </form>
        </div>
    );
}
