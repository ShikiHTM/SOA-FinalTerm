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
import type { Dispatch,SetStateAction } from "react";
import { useState,type ReactNode } from "react";
import { Link,useParams } from "react-router-dom";
import { canManage, date, displayNameFor, hasAccess, useApp } from "../../../shared/context";
import type { Assessment,Contest,Group,GroupMember,JoinRequest } from "../../../types";
import { hasGroupPermission } from "../../../authorization/permissions";

export function GroupDetail(): ReactNode {
    const { groupId }: { groupId?: string } = useParams();
    const { data, api, refresh, accounts }: ReturnType<typeof useApp> = useApp();
    const [password, setPassword]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [busyUser, setBusyUser]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [leaving, setLeaving]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === groupId,
    );
    if (!group) return <p className="empty">Không tìm thấy nhóm.</p>;
    async function join(): Promise<void> {
        try {
            if (group) await api.joinGroup(group.id, password);
            await refresh();
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể tham gia nhóm.");
        }
    }
    async function leave(): Promise<void> {
        if (!group || !window.confirm(`Bạn có chắc muốn rời nhóm ${group.name}?`)) return;
        try {
            setLeaving(true);
            setError("");
            await api.leaveGroup(group.id);
            await refresh();
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể rời nhóm.");
        } finally {
            setLeaving(false);
        }
    }
    async function reviewRequest(userEmail: string, decision: "APPROVE" | "REJECT"): Promise<void> {
        if (!group) return;
        try {
            setBusyUser(userEmail);
            setError("");
            await api.reviewJoinRequest(group.id, userEmail, decision);
            await refresh();
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể xử lý yêu cầu.");
        } finally {
            setBusyUser("");
        }
    }
    const requests: JoinRequest[] = data.joinRequests.filter(
        (request: JoinRequest): boolean => request.groupId === group.id,
    );
    const members: GroupMember[] = data.groupMembers.filter(
        (member: GroupMember): boolean => member.groupId === group.id,
    );
    const exams: Assessment[] = data.assessments.filter(
        (item: Assessment): boolean => item.groupId === group.id,
    );
    const contestIds: Set<string> = new Set(exams.map((exam: Assessment): string => exam.id));
    const contests: Contest[] = data.contests.filter((contest): boolean =>
        contestIds.has(contest.assessmentId),
    );
    return (
        <div className="group-detail-page">
            <Link className="group-breadcrumb" to="/groups">
                Nhóm học tập <span>/</span> Chi tiết nhóm
            </Link>
            <header className="group-hero">
                <div className="group-hero-icon">
                    <Users size={27} strokeWidth={1.7} />
                </div>
                <div className="group-hero-content">
                    <div className="group-hero-label">
                        <span>NHÓM HỌC TẬP</span>
                        <span className="group-visibility">
                            {group.visibility === "PRIVATE" ? (
                                <LockKeyhole size={13} />
                            ) : (
                                <Globe2 size={13} />
                            )}
                            {group.visibility === "PRIVATE" ? "Riêng tư" : "Công khai"}
                        </span>
                    </div>
                    <h1>{group.name}</h1>
                    <p>{group.description || "Chưa có mô tả cho nhóm này."}</p>
                </div>
                <div className="group-hero-code">
                    <span>MÃ NHÓM</span>
                    <strong>{group.code}</strong>
                </div>
            </header>

            <div className="group-workspace">
                <div className="group-content">
                    {canManage(group) && (
                        <section className="group-section group-management">
                            <div className="group-section-heading">
                                <div>
                                    <p className="group-section-kicker">DÀNH CHO NGƯỜI QUẢN LÝ NHÓM</p>
                                    <h2>Quản lý nhóm</h2>
                                    <p>Quản lý nội dung và hoạt động học tập của nhóm.</p>
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
                                        <strong>Tạo đề thi</strong>
                                        <small>Thêm câu hỏi mới</small>
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
                                        <strong>Tạo kỳ thi</strong>
                                        <small>Lên lịch kiểm tra</small>
                                    </span>
                                </Link>
                                <Link className="group-action" to={`/groups/${group.id}/grading`}>
                                    <span className="group-action-icon">
                                        <ClipboardCheck size={19} />
                                    </span>
                                    <span>
                                        <strong>Chấm bài</strong>
                                        <small>Xem bài đã nộp</small>
                                    </span>
                                </Link>
                                {hasGroupPermission(group.role, "MANAGE_MEMBERS") && (
                                    <Link className="group-action" to={`/groups/${group.id}/settings`}>
                                        <span className="group-action-icon">
                                            <Settings size={19} />
                                        </span>
                                        <span>
                                            <strong>
                                                {hasGroupPermission(group.role, "MANAGE_SETTINGS")
                                                    ? "Cài đặt nhóm"
                                                    : "Quản lý thành viên"}
                                            </strong>
                                            <small>Vai trò và thành viên</small>
                                        </span>
                                    </Link>
                                )}
                            </div>
                        </section>
                    )}

                    <section className="group-section">
                        <div className="group-section-heading">
                            <div>
                                <p className="group-section-kicker">TÀI LIỆU HỌC TẬP</p>
                                <h2>Đề của nhóm</h2>
                                <p>Khám phá và luyện tập với các bộ câu hỏi.</p>
                            </div>
                            {hasAccess(group) && (
                                <span className="group-section-count">{exams.length} đề</span>
                            )}
                        </div>
                        {hasAccess(group) ? (
                            exams.length ? (
                                <div className="group-resource-list">
                                    {exams.map(
                                        (exam: Assessment): ReactNode => (
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
                                                        {exam.questions.length} câu hỏi ·{" "}
                                                        {exam.source === "PDF"
                                                            ? "PDF"
                                                            : "Đề trực tuyến"}
                                                    </small>
                                                </span>
                                                <span className="group-resource-link">Xem đề</span>
                                            </Link>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <div className="group-empty">
                                    <span>
                                        <BookOpen size={19} />
                                    </span>
                                    <div>
                                        <strong>Chưa có đề thi</strong>
                                        <p>Đề thi của nhóm sẽ xuất hiện ở đây.</p>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="group-empty">
                                <span>
                                    <LockKeyhole size={19} />
                                </span>
                                <div>
                                    <strong>Nội dung dành cho thành viên</strong>
                                    <p>Hãy tham gia nhóm để xem các đề thi.</p>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="group-section">
                        <div className="group-section-heading">
                            <div>
                                <p className="group-section-kicker">HOẠT ĐỘNG</p>
                                <h2>Kỳ thi của nhóm</h2>
                                <p>Theo dõi các kỳ thi được tổ chức trong nhóm.</p>
                            </div>
                            {hasAccess(group) && (
                                <span className="group-section-count">
                                    {contests.length} kỳ thi
                                </span>
                            )}
                        </div>
                        {hasAccess(group) ? (
                            contests.length ? (
                                <div className="group-resource-list">
                                    {contests.map(
                                        (contest: Contest): ReactNode => (
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
                                                    <small>Kết thúc: {date(contest.endAt)}</small>
                                                </span>
                                                <span className="group-resource-link">
                                                    Xem kỳ thi
                                                </span>
                                            </Link>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <div className="group-empty">
                                    <span>
                                        <CalendarDays size={19} />
                                    </span>
                                    <div>
                                        <strong>Chưa có kỳ thi</strong>
                                        <p>Các kỳ thi của nhóm sẽ xuất hiện ở đây.</p>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="group-empty">
                                <span>
                                    <LockKeyhole size={19} />
                                </span>
                                <div>
                                    <strong>Nội dung dành cho thành viên</strong>
                                    <p>Hãy tham gia nhóm để xem các kỳ thi.</p>
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <aside className="group-side">
                    <section className="group-section group-information">
                        <div className="group-section-heading">
                            <div>
                                <p className="group-section-kicker">TỔNG QUAN</p>
                                <h2>Thông tin nhóm</h2>
                            </div>
                        </div>
                        <dl className="group-info-list">
                            <div>
                                <dt>Mã nhóm</dt>
                                <dd>{group.code}</dd>
                            </div>
                            <div>
                                <dt>Phạm vi</dt>
                                <dd>{group.visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}</dd>
                            </div>
                            <div>
                                <dt>Vai trò của bạn</dt>
                                <dd>
                                    {group.role === "OWNER"
                                        ? "Chủ nhóm"
                                        : group.role === "MODERATOR"
                                          ? "Điều hành viên"
                                        : group.role === "MEMBER"
                                          ? "Thành viên"
                                          : group.pending
                                            ? "Đang chờ duyệt"
                                            : "Chưa tham gia"}
                                </dd>
                            </div>
                        </dl>
                        {(group.role === "MEMBER" || group.role === "MODERATOR") && (
                            <div className="group-membership-action">
                                {error && (
                                    <p className="error" role="alert">
                                        {error}
                                    </p>
                                )}
                                <button
                                    className="button group-leave-button"
                                    type="button"
                                    disabled={leaving}
                                    onClick={(): void => {
                                        void leave();
                                    }}
                                >
                                    {leaving ? "Đang rời nhóm…" : "Rời nhóm"}
                                </button>
                            </div>
                        )}
                        {group.role === "VISITOR" && !group.pending && (
                            <div className="group-membership-action form">
                                {group.joinPolicy === "PASSWORD" && (
                                    <label>
                                        Mật khẩu nhóm
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(event): void =>
                                                setPassword(event.target.value)
                                            }
                                        />
                                    </label>
                                )}
                                {error && (
                                    <p className="error" role="alert">
                                        {error}
                                    </p>
                                )}
                                <button
                                    className="button primary"
                                    type="button"
                                    onClick={(): void => {
                                        void join();
                                    }}
                                >
                                    {group.joinPolicy === "APPROVAL"
                                        ? "Yêu cầu tham gia"
                                        : "Tham gia nhóm"}
                                </button>
                            </div>
                        )}
                        {group.role === "VISITOR" && group.pending && (
                            <p className="group-owner-note">
                                Yêu cầu tham gia của bạn đang chờ chủ nhóm phê duyệt.
                            </p>
                        )}
                    </section>
                    {hasAccess(group) && (
                        <section className="group-section">
                            <div className="group-section-heading">
                                <div>
                                    <p className="group-section-kicker">CỘNG ĐỒNG</p>
                                    <h2>Thành viên</h2>
                                </div>
                                <span className="group-section-count">{members.length} người</span>
                            </div>
                            {members.length ? (
                                <div className="group-request-list">
                                    {members.map((member: GroupMember): ReactNode => (
                                        <Link
                                            className="group-request-person"
                                            key={member.userEmail}
                                            to={`/users/${encodeURIComponent(member.userEmail)}`}
                                        >
                                            <span className="group-person-avatar">
                                                {displayNameFor(accounts, member.userEmail).charAt(0).toUpperCase()}
                                            </span>
                                            <span>
                                                <strong>{displayNameFor(accounts, member.userEmail)}</strong>
                                                <small>{member.userEmail} · {member.role === "OWNER" ? "Chủ nhóm" : member.role === "MODERATOR" ? "Điều hành viên" : "Thành viên"}</small>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="group-request-empty">
                                    <Users size={20} />
                                    <p>Chưa có thành viên để hiển thị.</p>
                                </div>
                            )}
                        </section>
                    )}
                    {hasGroupPermission(group.role, "MANAGE_MEMBERS") && group.joinPolicy === "APPROVAL" && (
                        <section className="group-section group-requests">
                            <div className="group-section-heading">
                                <div>
                                    <p className="group-section-kicker">THÀNH VIÊN</p>
                                    <h2>Yêu cầu tham gia</h2>
                                </div>
                                <span className="group-section-count">{requests.length}</span>
                            </div>
                            {error && (
                                <p className="error" role="alert">
                                    {error}
                                </p>
                            )}
                            {requests.length ? (
                                <div className="group-request-list">
                                    {requests.map(
                                        (request: JoinRequest): ReactNode => (
                                            <div className="group-request" key={request.userEmail}>
                                                <div className="group-request-person">
                                                    <span className="group-person-avatar">
                                                        {displayNameFor(accounts, request.userEmail).charAt(0).toUpperCase()}
                                                    </span>
                                                    <div>
                                                        <strong>{displayNameFor(accounts, request.userEmail)}</strong>
                                                        <small>{request.userEmail} · Muốn tham gia nhóm</small>
                                                    </div>
                                                </div>
                                                <div className="group-request-actions">
                                                    <button
                                                        className="button"
                                                        type="button"
                                                        disabled={!!busyUser}
                                                        onClick={(): void => {
                                                            void reviewRequest(
                                                                request.userEmail,
                                                                "REJECT",
                                                            );
                                                        }}
                                                    >
                                                        Từ chối
                                                    </button>
                                                    <button
                                                        className="button primary"
                                                        type="button"
                                                        disabled={!!busyUser}
                                                        onClick={(): void => {
                                                            void reviewRequest(
                                                                request.userEmail,
                                                                "APPROVE",
                                                            );
                                                        }}
                                                    >
                                                        Phê duyệt
                                                    </button>
                                                </div>
                                            </div>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <div className="group-request-empty">
                                    <Inbox size={20} />
                                    <p>Không có yêu cầu chờ duyệt.</p>
                                </div>
                            )}
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
