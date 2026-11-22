import { useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { canManageMember, hasGroupPermission } from "../../../authorization/permissions";
import { displayNameFor, useApp } from "../../../shared/context";
import type { Group, GroupMember } from "../../../types";

export function GroupManagement({ group }: { group: Group }): ReactNode {
    const { data, api, refresh, accounts, email }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const [name, setName]: [string, Dispatch<SetStateAction<string>>] = useState<string>(group.name);
    const [description, setDescription]: [string, Dispatch<SetStateAction<string>>] = useState<string>(group.description);
    const [visibility, setVisibility]: [Group["visibility"], Dispatch<SetStateAction<Group["visibility"]>>] = useState<Group["visibility"]>(group.visibility);
    const [policy, setPolicy]: [Group["joinPolicy"], Dispatch<SetStateAction<Group["joinPolicy"]>>] = useState<Group["joinPolicy"]>(group.joinPolicy === "OPEN" ? "APPROVAL" : group.joinPolicy);
    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] = useState<string>(group.password ?? "");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [message, setMessage]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const members: GroupMember[] = data.groupMembers.filter((item: GroupMember): boolean => item.groupId === group.id);

    async function run(action: () => Promise<void>, success: string): Promise<void> {
        try {
            setError("");
            setMessage("");
            await action();
            await refresh();
            setMessage(success);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể cập nhật nhóm.");
        }
    }

    return (
        <section className="group-section">
            <div className="group-section-heading">
                <div><p className="group-section-kicker">THÀNH VIÊN</p><h2>Quản lý nhóm</h2></div>
                <span className="group-section-count">{members.length} người</span>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            {hasGroupPermission(group.role, "MANAGE_SETTINGS") && (
                <form className="form" onSubmit={(event: FormEvent): void => {
                    event.preventDefault();
                    void run((): Promise<void> => api.updateGroup(group.id, name, description, visibility, policy, password), "Đã cập nhật nhóm.");
                }}>
                    <label>Tên nhóm<input value={name} required onChange={(event): void => setName(event.target.value)} /></label>
                    <label>Mô tả<textarea value={description} onChange={(event): void => setDescription(event.target.value)} /></label>
                    <label>Phạm vi<select value={visibility} onChange={(event): void => setVisibility(event.target.value as Group["visibility"])}><option value="PUBLIC">Công khai</option><option value="PRIVATE">Riêng tư</option></select></label>
                    {visibility === "PRIVATE" && <label>Cách tham gia<select value={policy} onChange={(event): void => setPolicy(event.target.value as Group["joinPolicy"])}><option value="APPROVAL">Phê duyệt</option><option value="PASSWORD">Mật khẩu</option></select></label>}
                    {visibility === "PRIVATE" && policy === "PASSWORD" && <label>Mật khẩu thử nghiệm<input type="password" value={password} required onChange={(event): void => setPassword(event.target.value)} /></label>}
                    <button className="button" type="submit">Lưu thay đổi</button>
                </form>
            )}
            <ul className="admin-list">
                {members.map((member: GroupMember): ReactNode => (
                    <li className="admin-row" key={member.userEmail}>
                        <span className="admin-row-copy"><strong>{displayNameFor(accounts, member.userEmail)}</strong><small>{member.userEmail} · {member.role}</small></span>
                        {hasGroupPermission(group.role, "ASSIGN_MODERATOR") && member.userEmail !== email && (
                            <>
                                <button className="button" type="button" onClick={(): void => {
                                    const role: "MEMBER" | "MODERATOR" = member.role === "MODERATOR" ? "MEMBER" : "MODERATOR";
                                    void run((): Promise<void> => api.setGroupMemberRole(group.id, member.userEmail, role), "Đã cập nhật vai trò.");
                                }}>{member.role === "MODERATOR" ? "Bãi nhiệm" : "Bổ nhiệm"}</button>
                            </>
                        )}
                        {hasGroupPermission(group.role, "TRANSFER_OWNERSHIP") && member.userEmail !== email && (
                            <button className="button" type="button" onClick={(): void => {
                                if (window.confirm(`Chuyển quyền chủ nhóm cho ${member.userEmail}?`)) {
                                    void run((): Promise<void> => api.transferGroupOwnership(group.id, member.userEmail), "Đã chuyển quyền.");
                                }
                            }}>Chuyển quyền</button>
                        )}
                        {member.userEmail !== email && canManageMember(group.role, member.role) && (
                            <>
                                <button className="button" type="button" onClick={(): void => {
                                    if (window.confirm(`Xóa ${member.userEmail} khỏi nhóm?`)) {
                                        void run((): Promise<void> => api.removeGroupMember(group.id, member.userEmail), "Đã xóa thành viên.");
                                    }
                                }}>Xóa</button>
                                <button className="button" type="button" onClick={(): void => {
                                    if (window.confirm(`Cấm ${member.userEmail} tham gia nhóm?`)) {
                                        void run((): Promise<void> => api.banGroupMember(group.id, member.userEmail), "Đã cấm thành viên.");
                                    }
                                }}>Cấm</button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {data.bannedMembers.some((item): boolean => item.groupId === group.id) && (
                <div>
                    <h3>Người bị cấm</h3>
                    {data.bannedMembers.filter((item): boolean => item.groupId === group.id).map((item): ReactNode => (
                        <div className="admin-row" key={item.userEmail}>
                            <span className="admin-row-copy">{item.userEmail}</span>
                            <button className="button" type="button" onClick={(): void => {
                                void run((): Promise<void> => api.unbanGroupMember(group.id, item.userEmail), "Đã bỏ cấm.");
                            }}>Bỏ cấm</button>
                        </div>
                    ))}
                </div>
            )}
            {hasGroupPermission(group.role, "DELETE_GROUP") && (
                <button className="button" type="button" onClick={(): void => {
                    if (window.confirm("Xóa nhóm và toàn bộ đề, kỳ thi, bài nộp liên quan? Không thể hoàn tác.")) {
                        void run(async (): Promise<void> => { await api.deleteOwnedGroup(group.id); navigate("/groups"); }, "Đã xóa nhóm.");
                    }
                }}>Xóa nhóm</button>
            )}
        </section>
    );
}
