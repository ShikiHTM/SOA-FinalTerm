import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CalendarDays,
    Globe2,
    GraduationCap,
    LockKeyhole,
    Users,
} from "lucide-react";
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import { getServices } from "../../../data/services";
import type { Assessment, Contest, Group, Snapshot } from "../../../types";

type GuestPageProps = {
    themeControl: ReactNode;
};

export function GuestPage({ themeControl }: GuestPageProps): ReactNode {
    const { groupId, contestId }: { groupId?: string; contestId?: string } = useParams();
    const [data, setData]: [Snapshot | null, Dispatch<SetStateAction<Snapshot | null>>] =
        useState<Snapshot | null>(null);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    useEffect((): void => {
        void getServices().createDataSource("").read().then(setData).catch((reason: unknown): void => {
            setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu.");
        });
    }, []);

    const group: Group | undefined = data?.groups.find((item: Group): boolean => item.id === groupId);
    const publicContests: Contest[] = data?.contests.filter((item: Contest): boolean => {
        const assessment: Assessment | undefined = data.assessments.find(
            (exam: Assessment): boolean => exam.id === item.assessmentId,
        );
        return data.groups.some((itemGroup: Group): boolean =>
            itemGroup.id === assessment?.groupId && itemGroup.visibility === "PUBLIC",
        );
    }) ?? [];
    const contest: Contest | undefined = publicContests.find(
        (item: Contest): boolean => item.id === contestId,
    );
    const contestAssessment: Assessment | undefined = data?.assessments.find(
        (item: Assessment): boolean => item.id === contest?.assessmentId,
    );
    const contestGroup: Group | undefined = data?.groups.find(
        (item: Group): boolean => item.id === contestAssessment?.groupId,
    );

    return (
        <div className="guest-page">
            <header className="top guest-header">
                <Link className="brand" to="/discover" aria-label="LMS - Khám phá">
                    <span className="brand-icon">
                        <BookOpen size={19} strokeWidth={2.2} />
                    </span>
                    <span className="brand-name">lms<span>.</span></span>
                </Link>
                <span className="top-subtitle">Không gian học tập của bạn</span>
                <div className="top-right guest-header-actions">
                    <Link to="/users">Người dùng</Link>
                    {themeControl}
                    <Link className="button primary" to="/login">
                        Đăng nhập <ArrowRight size={16} />
                    </Link>
                </div>
            </header>
            <main className="main guest-main">
                <div className="demo">
                    <span className="demo-dot" />
                    <strong>CHẾ ĐỘ KHÁCH</strong>
                    <span>Khám phá trước, đăng nhập để tham gia và làm bài.</span>
                </div>
                {error && <p className="error" role="alert">{error}</p>}
                {!data && !error && <p>Đang tải dữ liệu…</p>}
                {data && (groupId || contestId) && (
                    <Link className="guest-back" to="/discover">
                        <ArrowLeft size={16} /> Quay lại khám phá
                    </Link>
                )}
                {data && groupId && (
                    group ? (
                        <section className="guest-detail">
                            <div className="guest-detail-heading">
                                <span className="guest-detail-icon"><Users size={25} /></span>
                                <div>
                                    <p className="eyebrow">NHÓM HỌC TẬP</p>
                                    <h1>{group.name}</h1>
                                    <p>{group.description || "Chưa có mô tả cho nhóm này."}</p>
                                </div>
                            </div>
                            <div className="panel guest-detail-panel">
                                <h2>Thông tin nhóm</h2>
                                <div className="guest-detail-row">
                                    <span>Phạm vi</span>
                                    <strong>{group.visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}</strong>
                                </div>
                                <div className="guest-detail-row">
                                    <span>Tham gia</span>
                                    <strong>Cần đăng nhập</strong>
                                </div>
                                <p className="guest-detail-hint">
                                    Đăng nhập để tham gia nhóm và khám phá các hoạt động học tập.
                                </p>
                                <Link className="button primary" to="/login">
                                    Đăng nhập để tham gia <ArrowRight size={16} />
                                </Link>
                            </div>
                        </section>
                    ) : <p className="empty">Không tìm thấy nhóm.</p>
                )}
                {data && contestId && (
                    contest ? (
                        <section className="guest-detail">
                            <div className="guest-detail-heading">
                                <span className="guest-detail-icon"><GraduationCap size={25} /></span>
                                <div>
                                    <p className="eyebrow">KỲ THI CÔNG KHAI</p>
                                    <h1>{contest.title}</h1>
                                    <p>{contestGroup?.name ?? "Kỳ thi cộng đồng"}</p>
                                </div>
                            </div>
                            <div className="panel guest-detail-panel">
                                <h2>Thông tin kỳ thi</h2>
                                <div className="guest-detail-row">
                                    <span>Bắt đầu</span>
                                    <strong>{new Date(contest.startAt).toLocaleString("vi-VN")}</strong>
                                </div>
                                <div className="guest-detail-row">
                                    <span>Kết thúc</span>
                                    <strong>{new Date(contest.endAt).toLocaleString("vi-VN")}</strong>
                                </div>
                                <p className="guest-detail-hint">
                                    Đăng nhập để tham gia kỳ thi và lưu kết quả của bạn.
                                </p>
                                <Link className="button primary" to="/login">
                                    Đăng nhập để tham gia <ArrowRight size={16} />
                                </Link>
                            </div>
                        </section>
                    ) : <p className="empty">Không tìm thấy kỳ thi công khai.</p>
                )}
                {data && !groupId && !contestId && (
                    <div className="dashboard guest-discover">
                        <section className="dashboard-welcome guest-welcome">
                            <div className="welcome-copy">
                                <p className="welcome-kicker">
                                    <span /> KHÔNG GIAN HỌC TẬP CỦA BẠN
                                </p>
                                <h1>
                                    Học cùng nhau.<br />
                                    <span>Tiến bộ mỗi ngày.</span>
                                </h1>
                                <p>Khám phá cộng đồng học tập và những kỳ thi phù hợp với bạn.</p>
                                <Link className="button primary guest-welcome-action" to="/login">
                                    Bắt đầu học tập <ArrowRight size={16} />
                                </Link>
                            </div>
                            <div className="welcome-summary guest-summary">
                                <span className="summary-icon"><GraduationCap size={23} /></span>
                                <div>
                                    <strong>{data.groups.length}</strong>
                                    <span>nhóm học tập</span>
                                </div>
                            </div>
                        </section>
                        <section className="discover-section guest-section" aria-labelledby="guest-groups-title">
                            <div className="discover-heading">
                                <div>
                                    <p className="eyebrow">CỘNG ĐỒNG HỌC TẬP</p>
                                    <h2 id="guest-groups-title">Khám phá nhóm</h2>
                                    <p>Tìm một không gian để cùng nhau học hỏi và phát triển.</p>
                                </div>
                                <span className="result-count">{data.groups.length} nhóm</span>
                            </div>
                            <div className="grid exam-grid">
                                {data.groups.map((item: Group): ReactNode => (
                                    <Link
                                        className="exam-card guest-card"
                                        to={`/discover/groups/${item.id}`}
                                        key={item.id}
                                    >
                                        <div className="exam-card-top">
                                            <span className="exam-icon"><Users size={20} /></span>
                                            <span className="exam-visibility">
                                                {item.visibility === "PUBLIC" ? (
                                                    <Globe2 size={13} />
                                                ) : (
                                                    <LockKeyhole size={13} />
                                                )}
                                                {item.visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}
                                            </span>
                                        </div>
                                        <div className="exam-card-body">
                                            <h3>{item.name}</h3>
                                            <p>{item.description || "Cùng nhau học tập và phát triển."}</p>
                                        </div>
                                        <div className="exam-card-footer">
                                            <span>Nhóm học tập</span>
                                            <strong>Xem nhóm <ArrowRight size={14} /></strong>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                        <section className="discover-section guest-section" aria-labelledby="guest-contests-title">
                            <div className="discover-heading">
                                <div>
                                    <p className="eyebrow">THỬ THÁCH BẢN THÂN</p>
                                    <h2 id="guest-contests-title">Kỳ thi công khai</h2>
                                    <p>Khám phá các kỳ thi được tổ chức bởi cộng đồng.</p>
                                </div>
                                <span className="result-count">{publicContests.length} kỳ thi</span>
                            </div>
                            {publicContests.length ? (
                                <div className="grid exam-grid">
                                    {publicContests.map((item: Contest): ReactNode => (
                                        <Link
                                            className="exam-card guest-card"
                                            to={`/discover/contests/${item.id}`}
                                            key={item.id}
                                        >
                                            <div className="exam-card-top">
                                                <span className="exam-icon"><GraduationCap size={20} /></span>
                                                <span className="exam-visibility"><Globe2 size={13} /> Công khai</span>
                                            </div>
                                            <div className="exam-card-body">
                                                <h3>{item.title}</h3>
                                                <p>Đăng nhập để tham gia và lưu kết quả.</p>
                                            </div>
                                            <div className="exam-card-footer">
                                                <span>
                                                    <CalendarDays size={15} /> Đến {new Date(item.endAt).toLocaleDateString("vi-VN")}
                                                </span>
                                                <strong>Xem kỳ thi <ArrowRight size={14} /></strong>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty dashboard-empty">
                                    <CalendarDays size={23} />
                                    <h3>Chưa có kỳ thi công khai</h3>
                                    <p>Hãy quay lại sau để khám phá các kỳ thi mới.</p>
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}
