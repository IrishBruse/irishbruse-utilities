import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("monaco-editor/editor/editor.api", () => ({
    editor: {},
    Range: class Range {},
}));

import { clampOffset, spansOverlap, subtractRanges, withoutTrailingLineBreak } from "../range";

describe("subtractRanges", () => {
    it("keeps the span when no cut overlaps it", () => {
        expect(subtractRanges(0, 10, [])).toEqual([{ start: 0, end: 10 }]);
        expect(subtractRanges(0, 10, [{ start: 10, end: 12 }])).toEqual([{ start: 0, end: 10 }]);
    });

    it("splits a span around a cut in the middle", () => {
        expect(subtractRanges(0, 10, [{ start: 3, end: 7 }])).toEqual([
            { start: 0, end: 3 },
            { start: 7, end: 10 },
        ]);
    });

    it("drops a span that a cut covers", () => {
        expect(subtractRanges(2, 6, [{ start: 0, end: 8 }])).toEqual([]);
    });

    it("applies later cuts to the pieces that remain", () => {
        expect(
            subtractRanges(0, 20, [
                { start: 2, end: 5 },
                { start: 12, end: 18 },
            ]),
        ).toEqual([
            { start: 0, end: 2 },
            { start: 5, end: 12 },
            { start: 18, end: 20 },
        ]);
    });
});

describe("withoutTrailingLineBreak", () => {
    it("drops a trailing line feed", () => {
        expect(withoutTrailingLineBreak("ab\n", 0, 3)).toEqual({ start: 0, end: 2 });
    });

    it("drops a trailing carriage return and line feed", () => {
        expect(withoutTrailingLineBreak("ab\r\n", 0, 4)).toEqual({ start: 0, end: 2 });
    });

    it("keeps text that has no trailing line break", () => {
        expect(withoutTrailingLineBreak("ab\r", 0, 3)).toEqual({ start: 0, end: 3 });
        expect(withoutTrailingLineBreak("ab", 1, 2)).toEqual({ start: 1, end: 2 });
    });

    it("stops at the start offset", () => {
        expect(withoutTrailingLineBreak("\n", 0, 1)).toEqual({ start: 0, end: 0 });
    });
});

describe("spansOverlap", () => {
    it("is true when the spans share an interior point", () => {
        expect(spansOverlap(0, 5, 4, 8)).toBe(true);
        expect(spansOverlap(2, 6, 0, 10)).toBe(true);
    });

    it("is false when the spans only touch or sit apart", () => {
        expect(spansOverlap(0, 4, 4, 8)).toBe(false);
        expect(spansOverlap(6, 8, 0, 4)).toBe(false);
    });
});

describe("clampOffset", () => {
    it("keeps an offset inside the length", () => {
        expect(clampOffset(3, 10)).toBe(3);
        expect(clampOffset(0, 10)).toBe(0);
        expect(clampOffset(10, 10)).toBe(10);
    });

    it("moves an offset that is outside the length onto the ends", () => {
        expect(clampOffset(-1, 10)).toBe(0);
        expect(clampOffset(11, 10)).toBe(10);
    });
});
