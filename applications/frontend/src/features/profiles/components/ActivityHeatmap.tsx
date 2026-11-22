import type { ReactNode } from "react";
import { buildActivityHeatmap, type ActivityHeatmapData, type HeatmapCell } from "../utils/activityHeatmap";

const DAY_LABELS: readonly string[] = ["", "Mon", "", "Wed", "", "Fri", ""];

export function ActivityHeatmap({
    timestamps,
    weeks = 16
}: {
    timestamps: string[];
    weeks?: number;
}): ReactNode {
    const heatmap: ActivityHeatmapData = buildActivityHeatmap(timestamps, weeks);
    const monthLabelByCol: Map<number, string> = new Map<number, string>(
        heatmap.monthLabels.map((item): [number, string] => [item.columnIndex, item.label])
    );

    return (
        <section className="panel heatmap-panel" aria-label="Submission activity">
            <div className="heatmap-header">
                <div>
                    <p className="eyebrow">ACTIVITY</p>
                    <h2>{heatmap.totalSubmissions} recent submissions</h2>
                </div>
                <div className="heatmap-streaks">
                    <span>
                        Active days: <strong>{heatmap.activeDays}</strong>
                    </span>
                    <span>
                        Current streak: <strong>{heatmap.currentStreak}d</strong>
                    </span>
                    <span>
                        Best streak: <strong>{heatmap.longestStreak}d</strong>
                    </span>
                </div>
            </div>
            <div className="heatmap-scroll">
                <div className="heatmap-body">
                    <div className="heatmap-day-labels" aria-hidden="true">
                        {DAY_LABELS.map((label: string, index: number): ReactNode => (
                            <span key={index}>{label}</span>
                        ))}
                    </div>
                    <div className="heatmap-columns-wrap">
                        <div className="heatmap-months" aria-hidden="true">
                            {heatmap.columns.map((_, colIndex: number): ReactNode => (
                                <span key={colIndex}>{monthLabelByCol.get(colIndex) ?? ""}</span>
                            ))}
                        </div>
                        <div className="heatmap-columns">
                            {heatmap.columns.map((column: HeatmapCell[], colIndex: number): ReactNode => (
                                <div className="heatmap-column" key={colIndex}>
                                    {column.map((cell: HeatmapCell): ReactNode => (
                                        <span
                                            key={cell.dateKey}
                                            className={`heatmap-cell ${cell.isFuture ? "heatmap-cell-future" : ""}`}
                                            data-level={cell.level}
                                            title={
                                                cell.isFuture
                                                    ? cell.dateKey
                                                    : `${cell.count} submission${cell.count === 1 ? "" : "s"} on ${cell.dateKey}`
                                            }
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="heatmap-legend" aria-hidden="true">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level: number): ReactNode => (
                    <span className="heatmap-cell" data-level={level} key={level} />
                ))}
                <span>More</span>
            </div>
        </section>
    );
}
