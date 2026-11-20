import type { Dispatch,SetStateAction } from "react";
import { useState,type FormEvent,type ReactNode } from "react";
import { Link,useNavigate } from "react-router-dom";
import { PageTitle,useApp } from "../../../shared/context";

export function NewGroup(): ReactNode {
    const { api, refresh }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const [name, setName]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [description, setDescription]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [visibility, setVisibility]: [
        "PUBLIC" | "PRIVATE",
        Dispatch<SetStateAction<"PUBLIC" | "PRIVATE">>,
    ] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
    const [policy, setPolicy]: [
        "APPROVAL" | "PASSWORD",
        Dispatch<SetStateAction<"APPROVAL" | "PASSWORD">>,
    ] = useState<"APPROVAL" | "PASSWORD">("APPROVAL");
    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    async function create(event: FormEvent): Promise<void> {
        event.preventDefault();
        if (
            !name.trim() ||
            (visibility === "PRIVATE" && policy === "PASSWORD" && !password.trim())
        ) {
            setError("Nhập tên nhóm và mật khẩu nếu nhóm yêu cầu.");
            return;
        }
        const id: string = crypto.randomUUID();
        try {
            await api.createGroup({
                id,
                name: name.trim(),
                description: description.trim(),
                code: id.slice(0, 8).toUpperCase(),
                visibility,
                role: "OWNER",
                joinPolicy: visibility === "PUBLIC" ? "OPEN" : policy,
                password: visibility === "PRIVATE" && policy === "PASSWORD" ? password : undefined,
            });
            await refresh();
            navigate(`/groups/${id}`);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không tạo được nhóm.");
        }
    }
    return (
        <>
            <Link className="back" to="/groups">
                ← Nhóm học tập
            </Link>
            <PageTitle
                label="QUẢN LÝ NHÓM"
                title="Tạo nhóm"
                description="Thiết lập không gian học tập của bạn."
            />
            <form
                className="panel form editor"
                onSubmit={(event): void => {
                    void create(event);
                }}
            >
                <label>
                    Tên nhóm
                    <input
                        required
                        value={name}
                        onChange={(event): void => setName(event.target.value)}
                    />
                </label>
                <label>
                    Mô tả
                    <textarea
                        rows={3}
                        value={description}
                        onChange={(event): void => setDescription(event.target.value)}
                    />
                </label>
                <label>
                    Phạm vi
                    <select
                        value={visibility}
                        onChange={(event): void =>
                            setVisibility(event.target.value as "PUBLIC" | "PRIVATE")
                        }
                    >
                        <option value="PUBLIC">Công khai</option>
                        <option value="PRIVATE">Riêng tư</option>
                    </select>
                </label>
                {visibility === "PRIVATE" && (
                    <>
                        <label>
                            Cách tham gia
                            <select
                                value={policy}
                                onChange={(event): void =>
                                    setPolicy(event.target.value as "APPROVAL" | "PASSWORD")
                                }
                            >
                                <option value="APPROVAL">Yêu cầu phê duyệt</option>
                                <option value="PASSWORD">Mật khẩu nhóm</option>
                            </select>
                        </label>
                        {policy === "PASSWORD" && (
                            <label>
                                Mật khẩu thử nghiệm
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(event): void => setPassword(event.target.value)}
                                />
                            </label>
                        )}
                    </>
                )}
                <p className="hint">Nhóm chỉ lưu trên trình duyệt; không dùng mật khẩu thật.</p>
                {error && <p className="error">{error}</p>}
                <button className="button primary">Tạo nhóm thử nghiệm</button>
            </form>
        </>
    );
}
