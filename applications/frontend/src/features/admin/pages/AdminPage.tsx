import { BookOpen, CalendarDays, ClipboardList, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Account } from "../../../data/contracts/services";
import { getServices } from "../../../data/services";
import { useApp } from "../../../shared/context";
import type { Assessment, Contest, Group } from "../../../types";

export function AdminPage(): ReactNode {
    const { data, api, refresh, email }: ReturnType<typeof useApp> = useApp();
    const [accounts, setAccounts]: [Account[], Dispatch<SetStateAction<Account[]>>] = useState<Account[]>([]);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    // TODO: Lấy danh sách và thao tác quản trị tài khoản qua API được phân quyền.
    useEffect((): void => { void getServices().accounts.list().then(setAccounts).catch((reason: unknown): void => setError(reason instanceof Error ? reason.message : "Không tải được tài khoản.")); }, []);

    async function changeStatus(target: string, status: Account["status"]): Promise<void> {
        try {
            await getServices().accounts.setStatus(email, target, status);
            setAccounts(await getServices().accounts.list());
            setError("");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không cập nhật được tài khoản.");
        }
    }

    async function remove(
        kind: "group" | "assessment" | "contest",
        id: string,
        title: string,
    ): Promise<void> {
        const consequence: string = kind === "group"
            ? "Các đề, kỳ thi, bài nộp và yêu cầu tham gia thuộc nhóm cũng sẽ bị xóa."
            : kind === "assessment"
              ? "Các kỳ thi và bài nộp thuộc đề cũng sẽ bị xóa."
              : "Các bài nộp thuộc kỳ thi cũng sẽ bị xóa.";
        if (!window.confirm(`Xóa “${title}”? ${consequence} Không thể hoàn tác.`)) {
            return;
        }
        try {
            setBusy(true);
            setError("");
            if (kind === "group") await api.adminDeleteGroup(id);
            else if (kind === "assessment") await api.adminDeleteAssessment(id);
            else await api.adminDeleteContest(id);
            await refresh();
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể xóa dữ liệu.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="admin-page">
            <header className="admin-heading">
                <p className="eyebrow">QUẢN TRỊ HỆ THỐNG</p>
                <h1>Tổng quan kiểm duyệt</h1>
                <p>Theo dõi các nhóm và hoạt động học tập trên hệ thống.</p>
            </header>
            {error && <p className="error" role="alert">{error}</p>}

            <section className="admin-stats" aria-label="Thống kê hệ thống">
                <div className="admin-stat">
                    <span className="admin-stat-icon"><Users size={21} /></span>
                    <div><span>Nhóm học tập</span><strong>{data.groups.length}</strong></div>
                </div>
                <div className="admin-stat">
                    <span className="admin-stat-icon"><BookOpen size={21} /></span>
                    <div><span>Đề thi</span><strong>{data.assessments.length}</strong></div>
                </div>
                <div className="admin-stat">
                    <span className="admin-stat-icon"><ClipboardList size={21} /></span>
                    <div><span>Kỳ thi</span><strong>{data.contests.length}</strong></div>
                </div>
            </section>

            <div className="admin-sections">
                <section className="admin-section admin-contests">
                    <div className="admin-section-heading"><div><p className="eyebrow">TÀI KHOẢN</p><h2>Quản lý người dùng</h2><p>Quản lý trạng thái tài khoản thử nghiệm.</p></div><span className="admin-count">{accounts.length} tài khoản</span></div>
                    <ul className="admin-list">
                        {accounts.map((account: Account): ReactNode => (
                            <li className="admin-row" key={account.email}>
                                <span className="admin-row-copy"><strong>{account.displayName}</strong><small>{account.email} · {account.status}</small></span>
                                {account.email !== email && (
                                    <>
                                        <button className="button" type="button" onClick={(): void => { void changeStatus(account.email, account.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"); }}>{account.status === "SUSPENDED" ? "Khôi phục" : "Đình chỉ"}</button>
                                        <button className="button" type="button" onClick={(): void => { void changeStatus(account.email, account.status === "BANNED" ? "ACTIVE" : "BANNED"); }}>{account.status === "BANNED" ? "Bỏ cấm" : "Cấm"}</button>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
                <section className="admin-section">
                    <div className="admin-section-heading">
                        <div>
                            <p className="eyebrow">CỘNG ĐỒNG</p>
                            <h2>Nhóm học tập</h2>
                            <p>Các nhóm hiện có trên hệ thống.</p>
                        </div>
                        <span className="admin-count">{data.groups.length} nhóm</span>
                    </div>
                    {data.groups.length ? (
                        <ul className="admin-list">
                            {data.groups.map((group: Group): ReactNode => (
                                <li className="admin-row" key={group.id}>
                                    <span className="admin-row-icon"><Users size={18} /></span>
                                    <span className="admin-row-copy">
                                        <strong>{group.name}</strong>
                                        <small>{group.description || "Chưa có mô tả."}</small>
                                    </span>
                                    <span className="admin-badge">
                                        {group.visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}
                                    </span>
                                    <button className="button" type="button" disabled={busy}
                                        aria-label={`Xóa nhóm ${group.name}`}
                                        onClick={(): void => { void remove("group", group.id, group.name); }}>
                                        Xóa
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="admin-empty">Chưa có nhóm học tập.</p>}
                </section>

                <section className="admin-section">
                    <div className="admin-section-heading">
                        <div>
                            <p className="eyebrow">NỘI DUNG HỌC TẬP</p>
                            <h2>Đề thi</h2>
                            <p>Các đề được tạo trong nhóm.</p>
                        </div>
                        <span className="admin-count">{data.assessments.length} đề</span>
                    </div>
                    {data.assessments.length ? (
                        <ul className="admin-list">
                            {data.assessments.map((item: Assessment): ReactNode => {
                                const group: Group | undefined = data.groups.find(
                                    (entry: Group): boolean => entry.id === item.groupId,
                                );
                                return (
                                    <li className="admin-row" key={item.id}>
                                        <span className="admin-row-icon"><BookOpen size={18} /></span>
                                        <span className="admin-row-copy">
                                            <strong>{item.title}</strong>
                                            <small>{group?.name ?? "Không tìm thấy nhóm"}</small>
                                        </span>
                                        <span className="admin-badge">{item.source === "PDF" ? "PDF" : "Nhập trực tiếp"}</span>
                                        <button className="button" type="button" disabled={busy}
                                            aria-label={`Xóa đề ${item.title}`}
                                            onClick={(): void => { void remove("assessment", item.id, item.title); }}>
                                            Xóa
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : <p className="admin-empty">Chưa có đề thi.</p>}
                </section>

                <section className="admin-section admin-contests">
                    <div className="admin-section-heading">
                        <div>
                            <p className="eyebrow">HOẠT ĐỘNG</p>
                            <h2>Kỳ thi</h2>
                            <p>Các kỳ thi được tổ chức trong nhóm.</p>
                        </div>
                        <span className="admin-count">{data.contests.length} kỳ thi</span>
                    </div>
                    {data.contests.length ? (
                        <ul className="admin-list">
                            {data.contests.map((item: Contest): ReactNode => (
                                <li className="admin-row" key={item.id}>
                                    <span className="admin-row-icon"><CalendarDays size={18} /></span>
                                    <span className="admin-row-copy">
                                        <strong>{item.title}</strong>
                                        <small>Kết thúc {new Date(item.endAt).toLocaleString("vi-VN")}</small>
                                    </span>
                                    <button className="button" type="button" disabled={busy}
                                        aria-label={`Xóa kỳ thi ${item.title}`}
                                        onClick={(): void => { void remove("contest", item.id, item.title); }}>
                                        Xóa
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="admin-empty">Chưa có kỳ thi.</p>}
                </section>
            </div>
            {getServices().demo && (
                <div className="admin-notice">
                    <ShieldCheck size={18} />
                    <p>Các thao tác chỉ áp dụng cho dữ liệu mock trong trình duyệt này.</p>
                </div>
            )}
        </div>
    );
}
