import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationMeta } from "../../api/types";

export function Pagination({
    pagination,
    onPageChange,
    itemLabel = "items"
}: {
    pagination: PaginationMeta;
    onPageChange: (page: number) => void;
    itemLabel?: string;
}): ReactNode {
    if (pagination.total_pages <= 1) {
        return null;
    }

    const start: number = (pagination.page - 1) * pagination.limit + 1;
    const end: number = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <nav className="pagination-bar" aria-label="Pagination">
            <span className="pagination-summary">
                Showing {start}–{end} of {pagination.total} {itemLabel}
            </span>
            <div className="pagination-controls">
                <button
                    className="button button-small"
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={(): void => onPageChange(pagination.page - 1)}
                >
                    <ChevronLeft size={14} /> Previous
                </button>
                <span className="pagination-page-indicator">
                    Page {pagination.page} of {pagination.total_pages}
                </span>
                <button
                    className="button button-small"
                    type="button"
                    disabled={pagination.page >= pagination.total_pages}
                    onClick={(): void => onPageChange(pagination.page + 1)}
                >
                    Next <ChevronRight size={14} />
                </button>
            </div>
        </nav>
    );
}
