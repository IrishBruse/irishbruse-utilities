export const largeDocumentFitDelayMs = 200;

export interface LargeDocumentFit {
    onResize(): void;
    dispose(): void;
}

export function createLargeDocumentFit(
    isLarge: () => boolean,
    fitSoon: () => void,
    fitSettled: () => void,
    schedule: (callback: () => void, delay: number) => number = (callback, delay) =>
        window.setTimeout(callback, delay),
    cancel: (id: number) => void = (id) => {
        window.clearTimeout(id);
    },
    delayMs = largeDocumentFitDelayMs,
): LargeDocumentFit {
    let timer = 0;
    return {
        onResize() {
            if (!isLarge()) {
                if (timer !== 0) {
                    cancel(timer);
                    timer = 0;
                }
                fitSoon();
                return;
            }
            if (timer !== 0) {
                cancel(timer);
            }
            timer = schedule(() => {
                timer = 0;
                fitSettled();
            }, delayMs);
        },
        dispose() {
            if (timer === 0) {
                return;
            }
            cancel(timer);
            timer = 0;
        },
    };
}
