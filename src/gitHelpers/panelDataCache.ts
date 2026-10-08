type CacheEntry = {
    value: unknown;
    at: number;
};

export class PanelDataCache {
    private entries = new Map<string, CacheEntry>();
    private inflight = new Map<string, Promise<unknown>>();
    private epoch = new Map<string, number>();

    constructor(
        private readonly freshMs: number,
        private readonly now: () => number
    ) {}

    async load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        const hit = this.entries.get(key);
        if (hit && this.now() - hit.at < this.freshMs) {
            return hit.value as T;
        }

        const pending = this.inflight.get(key);
        if (pending) {
            return pending as Promise<T>;
        }

        const epoch = (this.epoch.get(key) ?? 0) + 1;
        this.epoch.set(key, epoch);
        const next = fetcher()
            .then((value) => {
                if (this.epoch.get(key) === epoch) {
                    this.entries.set(key, { value, at: this.now() });
                }
                return value;
            })
            .finally(() => {
                if (this.inflight.get(key) === next) {
                    this.inflight.delete(key);
                }
            });
        this.inflight.set(key, next);
        return next;
    }

    clear(): void {
        this.entries.clear();
        this.inflight.clear();
        for (const key of this.epoch.keys()) {
            this.epoch.set(key, (this.epoch.get(key) ?? 0) + 1);
        }
    }
}
