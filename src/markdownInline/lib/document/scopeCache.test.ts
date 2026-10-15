import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cachedScopes, fullPaintLineLimit, releaseScopes } from "./scopeCache";

describe("cachedScopes", () => {
    afterEach(() => {
        releaseScopes("doc");
    });

    it("reads the text once for a version", () => {
        const read = vi.fn(() => "# Hello");
        const first = cachedScopes("doc", 1, read);
        const second = cachedScopes("doc", 1, read);
        expect(fullPaintLineLimit).toBe(2000);
        expect(read).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
        expect(first.text).toBe("# Hello");
        expect(first.scopes.some((scope) => scope.kind === "heading")).toBe(true);
    });

    it("reads again when the version changes", () => {
        const read = vi.fn(() => "plain");
        cachedScopes("doc", 1, read);
        read.mockReturnValue("# Next");
        const next = cachedScopes("doc", 2, read);
        expect(read).toHaveBeenCalledTimes(2);
        expect(next.text).toBe("# Next");
    });

    it("reads again after the cache is released", () => {
        const read = vi.fn(() => "plain");
        cachedScopes("doc", 1, read);
        releaseScopes("doc");
        cachedScopes("doc", 1, read);
        expect(read).toHaveBeenCalledTimes(2);
    });
});
