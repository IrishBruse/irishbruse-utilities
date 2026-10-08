import { describe, expect, it, vi } from "vitest";
import { PanelDataCache } from "./panelDataCache";
import { planGitHelperRefresh, refreshVisualHoldMs } from "./cacheRefresh";

describe("planGitHelperRefresh", () => {
    it("reloads behind a saved panel", () => {
        expect(planGitHelperRefresh(true)).toBe("background");
    });

    it("shows the loading row when the panel has no saved result", () => {
        expect(planGitHelperRefresh(false)).toBe("loading");
    });
});

describe("refreshVisualHoldMs", () => {
    it("keeps the refresh mark visible for a short time", () => {
        expect(refreshVisualHoldMs(1_000, 1_100)).toBe(350);
    });

    it("ends the refresh mark after the short time", () => {
        expect(refreshVisualHoldMs(1_000, 1_600)).toBe(0);
    });
});

describe("PanelDataCache", () => {
    it("returns a fresh value without a second load", async () => {
        const now = vi.fn(() => 1_000);
        const cache = new PanelDataCache(15_000, now);
        const load = vi.fn(async () => "pr");

        await expect(cache.load("pr", load)).resolves.toBe("pr");
        await expect(cache.load("pr", load)).resolves.toBe("pr");
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("shares one load while the first load is still running", async () => {
        const cache = new PanelDataCache(15_000, () => 1_000);
        let release: (value: string) => void = () => undefined;
        const load = vi.fn(
            () =>
                new Promise<string>((resolve) => {
                    release = resolve;
                })
        );

        const first = cache.load("pr", load);
        const second = cache.load("pr", load);
        release("pr");

        await expect(first).resolves.toBe("pr");
        await expect(second).resolves.toBe("pr");
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("loads again after the fresh time", async () => {
        let nowMs = 1_000;
        const cache = new PanelDataCache(15_000, () => nowMs);
        const load = vi.fn(async () => "next");

        await cache.load("pr", load);
        nowMs = 20_000;
        await expect(cache.load("pr", load)).resolves.toBe("next");
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("drops saved values on clear and loads again", async () => {
        const cache = new PanelDataCache(15_000, () => 1_000);
        const load = vi.fn(async () => "pr");

        await cache.load("pr", load);
        cache.clear();
        await cache.load("pr", load);
        expect(load).toHaveBeenCalledTimes(2);
    });
});
