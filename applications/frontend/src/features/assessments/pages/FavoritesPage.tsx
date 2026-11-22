import { BookOpen, Globe2, Heart, LockKeyhole } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageTitle, useApp } from "../../../shared/context";
import type { Assessment, Group } from "../../../types";

export function FavoritesPage(): ReactNode {
    const { data, api, refresh }: ReturnType<typeof useApp> = useApp();
    const [error, setError]: [string, (value: string) => void] = useState<string>("");
    const favorites: Assessment[] = data.assessments.filter((assessment: Assessment): boolean =>
        data.favoriteAssessmentIds.includes(assessment.id),
    );

    async function removeFavorite(assessmentId: string): Promise<void> {
        try {
            await api.toggleFavorite(assessmentId);
            await refresh();
            setError("");
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không thể bỏ đề khỏi danh sách yêu thích.");
        }
    }

    return (
        <div className="favorites-page">
            <PageTitle
                label="THƯ VIỆN CỦA BẠN"
                title="Đề yêu thích"
                description="Những đề bạn đã lưu để xem lại hoặc tiếp tục luyện tập."
                action={<span className="favorites-count">{favorites.length} đề</span>}
            />

            {error && <p className="error" role="alert">{error}</p>}

            {favorites.length ? (
                <div className="favorites-grid">
                    {favorites.map((assessment: Assessment): ReactNode => {
                        const group: Group | undefined = data.groups.find(
                            (item: Group): boolean => item.id === assessment.groupId,
                        );

                        return (
                            <article className="card favorite-card" key={assessment.id}>
                                <div className="favorite-card-top">
                                    <span className="card-icon">
                                        <BookOpen size={20} />
                                    </span>
                                    <span className="badge">
                                        {group?.visibility === "PRIVATE" ? (
                                            <><LockKeyhole size={12} /> Riêng tư</>
                                        ) : (
                                            <><Globe2 size={12} /> Công khai</>
                                        )}
                                    </span>
                                    <button
                                        className="icon-button favorite-remove"
                                        type="button"
                                        aria-label={`Bỏ ${assessment.title} khỏi đề yêu thích`}
                                        title="Bỏ yêu thích"
                                        onClick={(): void => { void removeFavorite(assessment.id); }}
                                    >
                                        <Heart size={17} fill="currentColor" />
                                    </button>
                                </div>
                                <Link className="favorite-card-content" to={`/assessments/${assessment.id}`}>
                                    <h2>{assessment.title}</h2>
                                    <p>{assessment.description || "Mở đề để xem nội dung và thông tin luyện tập."}</p>
                                </Link>
                                <div className="favorite-card-bottom">
                                    <span>{group?.name ?? "Nhóm không còn khả dụng"}</span>
                                    <Link to={`/assessments/${assessment.id}`} aria-label={`Mở đề ${assessment.title}`}>
                                        {assessment.questions.length} câu <span aria-hidden="true">→</span>
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <section className="empty-state favorites-empty">
                    <span className="empty-symbol"><Heart size={23} /></span>
                    <h2>Chưa có đề yêu thích</h2>
                    <p>Lưu đề bằng biểu tượng trái tim để dễ dàng tìm lại tại đây.</p>
                    <Link className="button" to="/">Khám phá đề thi</Link>
                </section>
            )}
        </div>
    );
}
