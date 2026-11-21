import { useEffect, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import type { Account } from "../../../data/contracts/services";
import { getServices } from "../../../data/services";

export function ProfilesPage({ email }: { email: string }): ReactNode {
    const { userEmail }: { userEmail?: string } = useParams();
    const [accounts, setAccounts]: [Account[], Dispatch<SetStateAction<Account[]>>] = useState<Account[]>([]);
    const [name, setName]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [bio, setBio]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [message, setMessage]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const target: string = userEmail ?? email;
    const profile: Account | undefined = accounts.find((item: Account): boolean => item.email === target);
    const current: Account | undefined = accounts.find((item: Account): boolean => item.email === email);

    async function reload(): Promise<void> {
        try {
            // TODO: Lấy hồ sơ, thông tin theo dõi và quyền theo contract User/Gateway.
            const items: Account[] = await getServices().accounts.list();
            setAccounts(items);
            const account: Account | undefined = items.find((item: Account): boolean => item.email === target);
            setName(account?.displayName ?? "");
            setBio(account?.bio ?? "");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể tải hồ sơ.");
        }
    }
    useEffect((): void => { void reload(); }, [target]);

    async function save(event: FormEvent): Promise<void> {
        event.preventDefault();
        try { await getServices().accounts.updateProfile(email, name, bio); await reload(); setError(""); }
        catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Không thể lưu hồ sơ."); }
    }
    async function follow(): Promise<void> {
        try { await getServices().accounts.toggleFollow(email, target); await reload(); setError(""); }
        catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Không thể theo dõi."); }
    }
    return (
        <div className="main">
            <section className="panel form">
                <Link to={email ? "/" : "/discover"}>← Quay lại</Link>
                <h1>Hồ sơ người dùng</h1>
                {error && <p className="error" role="alert">{error}</p>}
                {message && <p role="status">{message}</p>}
                {profile ? (
                    <>
                        <h2>{profile.displayName}</h2>
                        <p>{profile.email}</p>
                        <p>{profile.bio || "Chưa có giới thiệu."}</p>
                        <button className="button" type="button" onClick={(): void => {
                            void navigator.clipboard.writeText(`${location.origin}/users/${encodeURIComponent(profile.email)}`).then(
                                (): void => { setMessage("Đã sao chép liên kết hồ sơ."); setError(""); },
                                (): void => setError("Không thể sao chép liên kết."),
                            );
                        }}>Sao chép liên kết hồ sơ</button>
                        {email && email !== target && <button className="button" type="button" onClick={(): void => { void follow(); }}>{current?.follows.includes(target) ? "Bỏ theo dõi" : "Theo dõi"}</button>}
                        {!email && <Link to="/login">Đăng nhập để theo dõi</Link>}
                        {email === target && (
                            <form className="form" onSubmit={(event): void => { void save(event); }}>
                                <label>Tên hiển thị<input value={name} required onChange={(event): void => setName(event.target.value)} /></label>
                                <label>Giới thiệu<textarea value={bio} onChange={(event): void => setBio(event.target.value)} /></label>
                                <button className="button primary" type="submit">Lưu hồ sơ</button>
                            </form>
                        )}
                    </>
                ) : target ? <p>Không tìm thấy hồ sơ.</p> : <p>Chọn người dùng bên dưới để xem hồ sơ.</p>}
            </section>
            <section className="panel">
                <h2>Người dùng</h2>
                <ul className="admin-list">
                    {accounts.filter((item: Account): boolean => item.status === "ACTIVE").map((item: Account): ReactNode => (
                        <li className="admin-row" key={item.email}>
                            <Link to={`/users/${encodeURIComponent(item.email)}`}>{item.displayName}</Link>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
