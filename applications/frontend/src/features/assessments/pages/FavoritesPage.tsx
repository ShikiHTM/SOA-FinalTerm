import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../../shared/context";
import type { Assessment } from "../../../types";

export function FavoritesPage(): ReactNode {
    const { data }: ReturnType<typeof useApp> = useApp();
    const favorites: Assessment[] = data.assessments.filter((item: Assessment): boolean =>
        data.favoriteAssessmentIds.includes(item.id),
    );
    return (
        <section className="panel">
            <h1>Đề yêu thích</h1>
            <p>Những đề bạn đã lưu để xem lại.</p>
            {favorites.length ? (
                <ul className="admin-list">
                    {favorites.map((item: Assessment): ReactNode => (
                        <li className="admin-row" key={item.id}>
                            <Link to={`/assessments/${item.id}`}>{item.title} →</Link>
                        </li>
                    ))}
                </ul>
            ) : <p>Chưa có đề yêu thích.</p>}
        </section>
    );
}
