import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cachedScopes, fullPaintLineLimit, releaseScopes } from "./scopeCache";

const tokenized = vi.hoisted(() => ({ values: [] as string[] }));

vi.mock("micromark", async () => {
    const actual = await vi.importActual<typeof import("micromark")>("micromark");
    return {
        ...actual,
        preprocess() {
            const read = actual.preprocess();
            return (value: unknown, encoding?: unknown, end?: unknown) => {
                if (typeof value === "string") {
                    tokenized.values.push(value);
                }
                return read(value as string, encoding as undefined, end as true);
            };
        },
    };
});

function largeDocument(): string {
    const body = Array.from({ length: fullPaintLineLimit + 50 }, (_, index) => `body ${index}`);
    return `# Hello\n\n${body.join("\n")}\nUNIQUE_TAIL_MARKER\n`;
}

describe("cachedScopes", () => {
    afterEach(() => {
        releaseScopes("doc");
        tokenized.values = [];
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

    it("parses a large document in line windows and skips cached gaps", () => {
        const text = largeDocument();
        const lineCount = text.split("\n").length - 1;
        const read = vi.fn(() => text);
        const head = cachedScopes("doc", 1, read, {
            startLine: 1,
            endLine: 1,
            startOffset: 0,
            endOffset: text.indexOf("\n"),
            lineCount,
        });
        expect(lineCount).toBeGreaterThan(fullPaintLineLimit);
        expect(tokenized.values.length).toBeGreaterThan(0);
        expect(tokenized.values.every((value) => !value.includes("UNIQUE_TAIL_MARKER"))).toBe(true);
        expect(head.scopes.some((scope) => scope.kind === "heading")).toBe(true);
        tokenized.values = [];
        const tailOffset = text.indexOf("UNIQUE_TAIL_MARKER");
        const tailLine = text.slice(0, tailOffset).split("\n").length;
        cachedScopes("doc", 1, read, {
            startLine: tailLine,
            endLine: tailLine,
            startOffset: tailOffset,
            endOffset: text.length,
            lineCount,
        });
        expect(tokenized.values.length).toBeGreaterThan(0);
        expect(tokenized.values.every((value) => !value.includes("# Hello"))).toBe(true);
        expect(tokenized.values.some((value) => value.includes("UNIQUE_TAIL_MARKER"))).toBe(true);
    });
});
