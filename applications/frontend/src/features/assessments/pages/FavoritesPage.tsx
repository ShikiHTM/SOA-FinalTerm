import { BookOpen, Globe2, Heart, LockKeyhole } from "lucide-react";
import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link } from "react-router-dom";
import { assessmentsApi } from "../../../api/client";
import type { FavoriteAssessmentItem, PaginatedResult } from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { Pagination } from "../../../shared/components/Pagination";
import { PageTitle } from "../../../shared/context";

const PAGE_LIMIT: number = 9;

export function FavoritesPage(): ReactNode {
    const [page, setPage]: [number, Dispatch<SetStateAction<number>>] = useState<number>(1);
    const [result, setResult]: [
        PaginatedResult<FavoriteAssessmentItem> | null,
        Dispatch<SetStateAction<PaginatedResult<FavoriteAssessmentItem> | null>>
    ] = useState<PaginatedResult<FavoriteAssessmentItem> | null>(null);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const loadFavorites: () => Promise<void> = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError("");
        try {
            setResult(await assessmentsApi.listFavorites({ page, limit: PAGE_LIMIT }));
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load favorite assessments."));
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect((): void => {
        void loadFavorites();
    }, [loadFavorites]);

    async function removeFavorite(assessmentId: string): Promise<void> {
        setError("");
        try {
            await assessmentsApi.unfavorite(assessmentId);
            await loadFavorites();
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to remove favorite."));
        }
    }

    const total: number = result?.pagination.total ?? 0;

    return (
        <div className="favorites-page page-enter">
            <PageTitle
                label="BOOKMARKS"
                title="Favorite assessments"
                description="Saved group and practice assessments for quick review."
                action={<span className="favorites-count">{total} saved</span>}
            />

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {loading && !result ? (
                <p className="muted">Loading favorites...</p>
            ) : result && result.items.length > 0 ? (
                <>
                    <div className="favorites-grid">
                        {result.items.map((item: FavoriteAssessmentItem): ReactNode => {
                            const exam = item.assessment;
                            return (
                                <article className="card favorite-card" key={exam.id}>
                                    <div className="favorite-card-top">
                                        <span className="card-icon">
                                            <BookOpen size={20} />
                                        </span>
                                        <span className="badge">
                                            {exam.visibility === "PUBLIC" ? (
                                                <>
                                                    <Globe2 size={12} /> PUBLIC
                                                </>
                                            ) : (
                                                <>
                                                    <LockKeyhole size={12} /> {exam.visibility}
                                                </>
                                            )}
                                        </span>
                                        <button
                                            className="icon-button favorite-remove"
                                            type="button"
                                            aria-label={`Remove ${exam.title} from favorites`}
                                            title="Remove favorite"
                                            onClick={(): void => {
                                                void removeFavorite(exam.id);
                                            }}
                                        >
                                            <Heart size={17} fill="currentColor" />
                                        </button>
                                    </div>
                                    <Link
                                        className="favorite-card-content"
                                        to={`/assessments/${exam.id}`}
                                    >
                                        <h2>{exam.title}</h2>
                                        <p>
                                            {exam.description ||
                                                "Open assessment details inside its owning group."}
                                        </p>
                                    </Link>
                                    <div className="favorite-card-bottom">
                                        <span>
                                            {exam.is_practice_enabled
                                                ? "Practice enabled"
                                                : "Contest scoped"}
                                        </span>
                                        <Link to={`/assessments/${exam.id}`}>
                                            {exam.question_count} questions{" "}
                                            <span aria-hidden="true">→</span>
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    <Pagination
                        pagination={result.pagination}
                        onPageChange={setPage}
                        itemLabel="favorites"
                    />
                </>
            ) : (
                <section className="empty-state favorites-empty">
                    <span className="empty-symbol">
                        <Heart size={23} />
                    </span>
                    <h2>No favorites yet</h2>
                    <p>Bookmark assessments you want to revisit quickly from your groups.</p>
                    <Link className="button" to="/groups">
                        Explore groups
                    </Link>
                </section>
            )}
        </div>
    );
}
