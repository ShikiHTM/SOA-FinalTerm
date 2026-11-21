type Timer = ReturnType<typeof setTimeout>;

export interface AttemptClock {
    now(): number;
    setTimer(callback: () => void, delay: number): Timer;
    clearTimer(timer: Timer): void;
}

const MAX_TIMER_DELAY: number = 2_147_483_647;
const browserClock: AttemptClock = {
    now: (): number => Date.now(),
    setTimer: (callback: () => void, delay: number): Timer => setTimeout(callback, delay),
    clearTimer: (timer: Timer): void => clearTimeout(timer),
};

export function watchAttemptDeadline(
    endAt: string,
    onExpired: () => void,
    clock: AttemptClock = browserClock,
): () => void {
    let timer: Timer | undefined;
    const deadline: number = Date.parse(endAt);

    function schedule(): void {
        const remaining: number = deadline - clock.now();
        if (remaining <= 0) {
            onExpired();
            return;
        }
        timer = clock.setTimer(schedule, Math.min(remaining, MAX_TIMER_DELAY));
    }

    timer = clock.setTimer(schedule, Math.max(0, Math.min(deadline - clock.now(), MAX_TIMER_DELAY)));
    return (): void => {
        if (timer !== undefined) clock.clearTimer(timer);
    };
}
