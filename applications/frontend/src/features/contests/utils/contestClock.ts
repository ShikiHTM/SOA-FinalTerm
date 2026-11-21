type ClockTimer = ReturnType<typeof setTimeout>;

export interface ContestClock {
    now(): number;
    setTimer(callback: () => void, delay: number): ClockTimer;
    clearTimer(timer: ClockTimer): void;
    onResume(callback: () => void): () => void;
}

const MAX_TIMER_DELAY: number = 2_147_483_647;

export type ContestStatus = "Sắp diễn ra" | "Đang diễn ra" | "Đã kết thúc";

export function getContestStatus(startAt: string, endAt: string, now: number): ContestStatus {
    if (now < Date.parse(startAt)) return "Sắp diễn ra";
    if (now >= Date.parse(endAt)) return "Đã kết thúc";
    return "Đang diễn ra";
}

const browserClock: ContestClock = {
    now: (): number => Date.now(),
    setTimer: (callback: () => void, delay: number): ClockTimer => setTimeout(callback, delay),
    clearTimer: (timer: ClockTimer): void => clearTimeout(timer),
    onResume(callback: () => void): () => void {
        window.addEventListener("focus", callback);
        document.addEventListener("visibilitychange", callback);
        return (): void => {
            window.removeEventListener("focus", callback);
            document.removeEventListener("visibilitychange", callback);
        };
    },
};

/** Cập nhật giao diện khi đến mốc thời gian hoặc khi người dùng quay lại tab. */
export function watchContestClock(
    startAt: string | undefined,
    endAt: string | undefined,
    onTick: (now: number) => void,
    clock: ContestClock = browserClock,
): () => void {
    const boundaries: number[] = [Date.parse(startAt ?? ""), Date.parse(endAt ?? "")]
        .filter((value: number): boolean => Number.isFinite(value));
    let timer: ClockTimer | undefined;

    function update(): void {
        if (timer !== undefined) clock.clearTimer(timer);
        timer = undefined;

        const now: number = clock.now();
        onTick(now);
        const next: number | undefined = boundaries
            .filter((boundary: number): boolean => boundary > now)
            .sort((first: number, second: number): number => first - second)[0];

        if (next !== undefined) {
            timer = clock.setTimer(update, Math.min(next - now, MAX_TIMER_DELAY));
        }
    }

    const unsubscribe: () => void = clock.onResume(update);
    update();
    return (): void => {
        if (timer !== undefined) clock.clearTimer(timer);
        unsubscribe();
    };
}
