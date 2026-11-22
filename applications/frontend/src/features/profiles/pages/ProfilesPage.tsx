import { useEffect, useState, type Dispatch, type FormEvent, type MouseEvent, type ReactNode, type SetStateAction } from "react";
import { Copy, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Account } from "../../../data/contracts/services";
import { getServices } from "../../../data/services";

export function ProfilesPage({
    email,
    onProfileUpdated,
}: {
    email: string;
    onProfileUpdated?: () => Promise<void>;
}): ReactNode {
    const { userEmail }: { userEmail?: string } = useParams();
    const location: ReturnType<typeof useLocation> = useLocation();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const pathname: string = location.pathname;
    const fallbackPath: string = email ? "/" : "/discover";
    const isDirectory: boolean = pathname === "/users";
    const [accounts, setAccounts]: [Account[], Dispatch<SetStateAction<Account[]>>] = useState<Account[]>([]);
    const [name, setName]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [bio, setBio]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [currentPassword, setCurrentPassword]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [newPassword, setNewPassword]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [confirmPassword, setConfirmPassword]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [message, setMessage]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const target: string = userEmail ?? email;
    const isOwnProfile: boolean = Boolean(email) && email === target;
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
        try {
            await getServices().accounts.updateProfile(email, name, bio);
            await reload();
            await onProfileUpdated?.();
            setError("");
            setMessage("Đã cập nhật hồ sơ.");
        }
        catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Không thể lưu hồ sơ."); }
    }
    async function toggleFollow(targetEmail: string): Promise<void> {
        try {
            await getServices().accounts.toggleFollow(email, targetEmail);
            await reload();
            setError("");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể cập nhật theo dõi.");
        }
    }
    async function changePassword(event: FormEvent): Promise<void> {
        event.preventDefault();
        setError("");
        setMessage("");
        if (newPassword !== confirmPassword) {
            setError("Mật khẩu mới và phần xác nhận không khớp.");
            return;
        }

        try {
            await getServices().accounts.changePassword(email, currentPassword, newPassword);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setMessage("Đã đổi mật khẩu.");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể đổi mật khẩu.");
        }
    }
    return (
        <div className="main profile-page">
            <header className="profile-page-heading">
                <Link
                    className="back-link"
                    to={fallbackPath}
                    onClick={(event: MouseEvent<HTMLAnchorElement>): void => {
                        event.preventDefault();
                        if (location.key !== "default") navigate(-1);
                        else navigate(fallbackPath, { replace: true });
                    }}
                >
                    ← Quay lại
                </Link>
                <p className="eyebrow">CỘNG ĐỒNG LMS</p>
                <h1>{isDirectory ? "Khám phá người dùng" : "Hồ sơ người dùng"}</h1>
                <p className="muted">
                    {isDirectory
                        ? "Tìm và kết nối với các thành viên trong cộng đồng."
                        : "Thông tin cá nhân và kết nối cộng đồng."}
                </p>
            </header>

            {error && <p className="error profile-feedback" role="alert">{error}</p>}
            {message && <p className="profile-feedback" role="status">{message}</p>}

            {isDirectory ? (
                <section className="panel profile-directory">
                    {accounts.filter((item: Account): boolean => item.status === "ACTIVE").map((item: Account): ReactNode => (
                        <article className="profile-directory-row" key={item.email}>
                            <Link className="profile-directory-person" to={`/users/${encodeURIComponent(item.email)}`}>
                                <span className="profile-avatar" aria-hidden="true">{item.displayName.charAt(0).toUpperCase()}</span>
                                <span>
                                    <strong>{item.displayName}</strong>
                                    <small>{item.bio || "Chưa có giới thiệu."}</small>
                                </span>
                            </Link>
                            {email && item.email !== email ? (
                                <button className="icon-button" type="button" aria-label={current?.follows.includes(item.email) ? `Bỏ theo dõi ${item.displayName}` : `Theo dõi ${item.displayName}`} title={current?.follows.includes(item.email) ? "Bỏ theo dõi" : "Theo dõi"} onClick={(): void => { void toggleFollow(item.email); }}>
                                    {current?.follows.includes(item.email) ? <UserCheck size={18} /> : <UserPlus size={18} />}
                                </button>
                            ) : !email ? (
                                <Link className="icon-button" aria-label="Đăng nhập để theo dõi" title="Đăng nhập để theo dõi" to="/login"><UserPlus size={18} /></Link>
                            ) : null}
                        </article>
                    ))}
                    {!accounts.some((item: Account): boolean => item.status === "ACTIVE") && (
                        <p className="profile-empty">Chưa có người dùng để hiển thị.</p>
                    )}
                </section>
            ) : profile ? (
                <>
                    <section className="panel profile-card">
                        <div className="profile-avatar profile-avatar-large" aria-hidden="true">
                            {profile.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="profile-identity">
                            <p className="eyebrow">THÀNH VIÊN LMS</p>
                            <h2>{profile.displayName}</h2>
                            <p className="profile-email">{profile.email}</p>
                            <p className="profile-bio">{profile.bio || "Chưa có giới thiệu."}</p>
                        </div>
                        <div className="profile-actions">
                            <button className="icon-button" type="button" aria-label="Sao chép liên kết hồ sơ" title="Sao chép liên kết hồ sơ" onClick={(): void => {
                                void navigator.clipboard.writeText(`${window.location.origin}/users/${encodeURIComponent(profile.email)}`).then(
                                    (): void => { setMessage("Đã sao chép liên kết hồ sơ."); setError(""); },
                                    (): void => setError("Không thể sao chép liên kết."),
                                );
                            }}><Copy size={18} /></button>
                            {email && email !== target && (
                                <button className="icon-button" type="button" aria-label={current?.follows.includes(target) ? "Bỏ theo dõi người dùng" : "Theo dõi người dùng"} title={current?.follows.includes(target) ? "Bỏ theo dõi" : "Theo dõi"} onClick={(): void => { void toggleFollow(target); }}>
                                    {current?.follows.includes(target) ? <UserCheck size={18} /> : <UserPlus size={18} />}
                                </button>
                            )}
                            {!email && <Link className="button" to="/login">Đăng nhập để theo dõi</Link>}
                        </div>
                    </section>

                    {isOwnProfile && (
                        <div className="profile-sections">
                            <section className="panel profile-section">
                                <p className="eyebrow">CÁ NHÂN</p>
                                <h2>Chỉnh sửa hồ sơ</h2>
                                <form className="form" onSubmit={(event: FormEvent): void => { void save(event); }}>
                                    <label>Tên hiển thị<input value={name} required onChange={(event): void => setName(event.target.value)} /></label>
                                    <label>Giới thiệu<textarea value={bio} onChange={(event): void => setBio(event.target.value)} /></label>
                                    <button className="button primary" type="submit">Lưu hồ sơ</button>
                                </form>
                            </section>

                            <section className="panel profile-section">
                                <p className="eyebrow">BẢO MẬT</p>
                                <h2>Đổi mật khẩu</h2>
                                <form className="form" onSubmit={(event: FormEvent): void => { void changePassword(event); }}>
                                    <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event): void => setCurrentPassword(event.target.value)} /></label>
                                    <label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={6} required value={newPassword} onChange={(event): void => setNewPassword(event.target.value)} /></label>
                                    <label>Xác nhận mật khẩu mới<input type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(event): void => setConfirmPassword(event.target.value)} /></label>
                                    <button className="button primary" type="submit">Cập nhật mật khẩu</button>
                                </form>
                            </section>

                            <section className="panel profile-section profile-following">
                                <div className="profile-section-heading">
                                    <div><p className="eyebrow">KẾT NỐI</p><h2>Đang theo dõi</h2></div>
                                    <span className="result-count">{current?.follows.length ?? 0}</span>
                                </div>
                                {current?.follows.length ? (
                                    <div className="profile-directory-list">
                                        {current.follows.map((followedEmail: string): ReactNode => {
                                            const followed: Account | undefined = accounts.find((item: Account): boolean => item.email === followedEmail);
                                            if (!followed) return null;
                                            return (
                                                <article className="profile-directory-row" key={followed.email}>
                                                    <Link className="profile-directory-person" to={`/users/${encodeURIComponent(followed.email)}`}>
                                                        <span className="profile-avatar" aria-hidden="true">{followed.displayName.charAt(0).toUpperCase()}</span>
                                                        <span><strong>{followed.displayName}</strong><small>{followed.email}</small></span>
                                                    </Link>
                                                    <button className="icon-button" type="button" aria-label={`Bỏ theo dõi ${followed.displayName}`} title="Bỏ theo dõi" onClick={(): void => { void toggleFollow(followed.email); }}><UserMinus size={18} /></button>
                                                </article>
                                            );
                                        })}
                                    </div>
                                ) : <p className="profile-empty">Bạn chưa theo dõi người dùng nào.</p>}
                            </section>
                        </div>
                    )}
                </>
            ) : (
                <section className="panel profile-empty-state">
                    <h2>Không tìm thấy hồ sơ</h2>
                    <p>Hồ sơ có thể không tồn tại hoặc không còn được công khai.</p>
                    <Link className="button" to={fallbackPath}>Quay lại</Link>
                </section>
            )}
        </div>
    );
}
