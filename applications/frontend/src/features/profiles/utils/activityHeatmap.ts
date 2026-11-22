import type { SubmissionMode } from "../../../api/types";

export interface HeatmapCell {
    dateKey: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
    isFuture: boolean;
}

export interface ActivityHeatmapData {
    columns: HeatmapCell[][];
    monthLabels: Array<{ columnIndex: number; label: string }>;
    totalSubmissions: number;
    activeDays: number;
    currentStreak: number;
    longestStreak: number;
}

export interface SubmissionStatsSummary {
    total: number;
    gradedCount: number;
    averagePercent: number | null;
    contestCount: number;
    practiceCount: number;
}

const MONTH_NAMES: readonly string[] = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
];

const MS_PER_DAY: number = 86_400_000;

export function toUtcDateKey(date: Date): string {
    const year: number = date.getUTCFullYear();
    const month: string = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day: string = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
    if (count <= 0) {
        return 0;
    }
    if (maxCount <= 1) {
        return 3;
    }
    const ratio: number = count / maxCount;
    if (ratio <= 0.25) {
        return 1;
    }
    if (ratio <= 0.5) {
        return 2;
    }
    if (ratio <= 0.75) {
        return 3;
    }
    return 4;
}

function computeStreaks(
    countByDay: Map<string, number>,
    todayUtcMs: number
): { currentStreak: number; longestStreak: number } {
    const activeDayNumbers: number[] = Array.from(countByDay.keys())
        .map((key: string): number => Math.floor(Date.parse(`${key}T00:00:00Z`) / MS_PER_DAY))
        .filter((value: number): boolean => Number.isFinite(value))
        .sort((left: number, right: number): number => left - right);

    let longestStreak: number = 0;
    let run: number = 0;
    let prevDay: number | null = null;
    for (const dayNum of activeDayNumbers) {
        if (prevDay !== null && dayNum === prevDay + 1) {
            run += 1;
        } else {
            run = 1;
        }
        if (run > longestStreak) {
            longestStreak = run;
        }
        prevDay = dayNum;
    }

    const todayDayNum: number = Math.floor(todayUtcMs / MS_PER_DAY);
    const activeSet: Set<number> = new Set<number>(activeDayNumbers);
    let cursor: number = activeSet.has(todayDayNum)
        ? todayDayNum
        : activeSet.has(todayDayNum - 1)
          ? todayDayNum - 1
          : -1;
    let currentStreak: number = 0;
    while (cursor >= 0 && activeSet.has(cursor)) {
        currentStreak += 1;
        cursor -= 1;
    }

    return { currentStreak, longestStreak };
}

export function buildActivityHeatmap(
    timestamps: string[],
    weeks: number = 16,
    now: Date = new Date()
): ActivityHeatmapData {
    const safeWeeks: number = Math.max(1, weeks);
    const todayUtcMs: number = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    );
    const todayDow: number = now.getUTCDay();
    const startUtcMs: number = todayUtcMs - ((safeWeeks - 1) * 7 + todayDow) * MS_PER_DAY;

    const countByDay: Map<string, number> = new Map<string, number>();
    let totalSubmissions: number = 0;

    for (const rawTimestamp of timestamps) {
        const parsedMs: number = Date.parse(rawTimestamp);
        if (!Number.isFinite(parsedMs)) {
            continue;
        }
        const key: string = toUtcDateKey(new Date(parsedMs));
        countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
        totalSubmissions += 1;
    }

    let maxInWindow: number = 0;
    for (let weekIndex: number = 0; weekIndex < safeWeeks; weekIndex += 1) {
        for (let dayIndex: number = 0; dayIndex < 7; dayIndex += 1) {
            const cellMs: number = startUtcMs + (weekIndex * 7 + dayIndex) * MS_PER_DAY;
            if (cellMs > todayUtcMs) {
                continue;
            }
            const key: string = toUtcDateKey(new Date(cellMs));
            const count: number = countByDay.get(key) ?? 0;
            if (count > maxInWindow) {
                maxInWindow = count;
            }
        }
    }

    const columns: HeatmapCell[][] = [];
    const monthLabels: Array<{ columnIndex: number; label: string }> = [];
    let lastMonth: number = -1;

    for (let weekIndex: number = 0; weekIndex < safeWeeks; weekIndex += 1) {
        const column: HeatmapCell[] = [];
        for (let dayIndex: number = 0; dayIndex < 7; dayIndex += 1) {
            const cellMs: number = startUtcMs + (weekIndex * 7 + dayIndex) * MS_PER_DAY;
            const cellDate: Date = new Date(cellMs);
            if (dayIndex === 0) {
                const monthIndex: number = cellDate.getUTCMonth();
                if (monthIndex !== lastMonth) {
                    monthLabels.push({
                        columnIndex: weekIndex,
                        label: MONTH_NAMES[monthIndex] ?? ""
                    });
                    lastMonth = monthIndex;
                }
            }
            const isFuture: boolean = cellMs > todayUtcMs;
            const dateKey: string = toUtcDateKey(cellDate);
            const count: number = isFuture ? 0 : (countByDay.get(dateKey) ?? 0);
            column.push({
                dateKey,
                count,
                level: isFuture ? 0 : getLevel(count, maxInWindow),
                isFuture
            });
        }
        columns.push(column);
    }

    const streaks: { currentStreak: number; longestStreak: number } = computeStreaks(
        countByDay,
        todayUtcMs
    );

    return {
        columns,
        monthLabels,
        totalSubmissions,
        activeDays: countByDay.size,
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak
    };
}

export function computeSubmissionStats(
    submissions: Array<{
        total_score: number | null;
        max_score: number;
        submission_mode?: SubmissionMode;
    }>
): SubmissionStatsSummary {
    let gradedCount: number = 0;
    let percentSum: number = 0;
    let contestCount: number = 0;
    let practiceCount: number = 0;

    for (const item of submissions) {
        if (item.submission_mode === "CONTEST") {
            contestCount += 1;
        } else if (item.submission_mode === "PRACTICE") {
            practiceCount += 1;
        }
        if (item.total_score !== null && item.max_score > 0) {
            gradedCount += 1;
            percentSum += (item.total_score / item.max_score) * 100;
        }
    }

    const averagePercent: number | null =
        gradedCount > 0 ? Math.round((percentSum / gradedCount) * 10) / 10 : null;

    return {
        total: submissions.length,
        gradedCount,
        averagePercent,
        contestCount,
        practiceCount
    };
}
